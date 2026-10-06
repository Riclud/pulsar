const std = @import("std");

const qt_modules = [_][]const u8{
    "Qt6Core",    "Qt6Gui",    "Qt6Qml",            "Qt6Quick",
    "Qt6Network", "Qt6OpenGL", "Qt6QmlIntegration",
};

const fallback_includes = [_][]const u8{
    "QtCore", "QtGui", "QtQml", "QtQuick", "QtNetwork", "QtOpenGL", "QtQmlIntegration",
};

/// Pulsar needs at least this Qt (major.minor). Lower versions are rejected.
const qt_min = "6.8";
/// Qt version Pulsar is developed and tested against (major.minor). Mismatches warn.
const qt_target = "6.8";

fn execCapture(b: *std.Build, argv: []const []const u8) ?[]const u8 {
    const res = std.process.run(b.allocator, b.graph.io, .{
        .argv = argv,
        .stdout_limit = .limited(1 << 20),
        .stderr_limit = .limited(1 << 16),
        .environ_map = &b.graph.environ_map,
    }) catch return null;
    switch (res.term) {
        .exited => |code| if (code != 0) return null,
        else => return null,
    }
    return std.mem.trim(u8, res.stdout, " \t\r\n");
}

fn tokenize(b: *std.Build, out: *std.ArrayList([]const u8), text: []const u8) void {
    var it = std.mem.tokenizeAny(u8, text, " \t\r\n");
    while (it.next()) |tok| out.append(b.allocator, tok) catch return;
}

/// pkg-config flags for Qt (Linux, Homebrew/macOS).
fn pkgConfig(b: *std.Build, mode: []const u8) ?[]const u8 {
    if (b.graph.environ_map.get("PULSAR_NO_PKGCONFIG") != null) return null;
    // An explicit Qt root wins over whatever pkg-config happens to report.
    if (b.graph.environ_map.get("PULSAR_QT") != null) return null;
    var argv: std.ArrayList([]const u8) = .empty;
    defer argv.deinit(b.allocator);
    argv.append(b.allocator, "pkg-config") catch return null;
    argv.append(b.allocator, mode) catch return null;
    for (qt_modules) |m| argv.append(b.allocator, m) catch return null;
    const out = execCapture(b, argv.items) orelse return null;
    return if (out.len == 0) null else out;
}

/// qmake fallback for Qt paths (Windows MinGW, some macOS installs).
/// PULSAR_QMAKE overrides the qmake binary (multiple Qt installs).
fn qmakeQuery(b: *std.Build, key: []const u8) ?[]const u8 {
    if (b.graph.environ_map.get("PULSAR_QMAKE")) |qm| {
        if (execCapture(b, &.{ qm, "-query", key })) |v| {
            if (v.len > 0) return v;
        }
    }
    // PULSAR_QT points at a Qt installation root (its bin/ holds qmake).
    if (b.graph.environ_map.get("PULSAR_QT")) |root| {
        if (std.fmt.allocPrint(b.allocator, "{s}/bin/qmake6", .{root}) catch null) |q| {
            if (execCapture(b, &.{ q, "-query", key })) |v| {
                if (v.len > 0) return v;
            }
        }
        if (std.fmt.allocPrint(b.allocator, "{s}/bin/qmake", .{root}) catch null) |q| {
            if (execCapture(b, &.{ q, "-query", key })) |v| {
                if (v.len > 0) return v;
            }
        }
    }
    if (execCapture(b, &.{ "qmake6", "-query", key })) |v| {
        if (v.len > 0) return v;
    }
    if (execCapture(b, &.{ "qmake", "-query", key })) |v| {
        if (v.len > 0) return v;
    }
    return null;
}

/// Qt version from pkg-config, falling back to qmake (honours PULSAR_QT/QMAKE).
fn detectQtVersion(b: *std.Build) ?[]const u8 {
    if (b.graph.environ_map.get("PULSAR_QT") == null and
        b.graph.environ_map.get("PULSAR_NO_PKGCONFIG") == null)
    {
        if (execCapture(b, &.{ "pkg-config", "--modversion", "Qt6Core" })) |v| {
            if (v.len > 0) return v;
        }
    }
    return qmakeQuery(b, "QT_VERSION");
}

fn parseMajorMinor(text: []const u8) ?struct { major: u32, minor: u32 } {
    var it = std.mem.tokenizeAny(u8, text, ".-");
    const major_s = it.next() orelse return null;
    const minor_s = it.next() orelse return null;
    return .{
        .major = std.fmt.parseInt(u32, major_s, 10) catch return null,
        .minor = std.fmt.parseInt(u32, minor_s, 10) catch return null,
    };
}

fn reportMissingQt() noreturn {
    std.log.err(
        \\Qt {s}+ was not found. The Pulsar QML host needs the Qt6 development
        \\files and tools (moc, QML modules).
        \\
        \\Install Qt and retry, e.g.:
        \\  Ubuntu/Debian: sudo apt install qt6-base-dev qt6-base-dev-tools qt6-declarative-dev qml6-module-qtquick-controls
        \\  Fedora:        sudo dnf install qt6-qtbase-devel qt6-qtdeclarative-devel
        \\  Arch:          sudo pacman -S qt6-base qt6-declarative qt6-quickcontrols2
        \\  macOS:         brew install qt
        \\  Windows:       MSYS2: pacman -S mingw-w64-x86_64-qt6-base mingw-w64-x86_64-qt6-declarative mingw-w64-x86_64-gcc
        \\
        \\Or point PULSAR_QMAKE (qmake binary) or PULSAR_QT (Qt root) at an
        \\existing installation. See README for details.
    , .{qt_min});
    std.process.exit(1);
}

fn requireQtVersion(version: []const u8) void {
    const v = parseMajorMinor(version) orelse {
        std.log.warn("could not parse Qt version '{s}'; skipping version check", .{version});
        return;
    };
    const min = parseMajorMinor(qt_min).?;
    const target = parseMajorMinor(qt_target).?;
    if (v.major < min.major or (v.major == min.major and v.minor < min.minor)) {
        std.log.err(
            "Qt {s} found, but Pulsar requires Qt >= {s}. Please install a newer Qt (see README).",
            .{ version, qt_min },
        );
        std.process.exit(1);
    }
    if (v.major != target.major or v.minor != target.minor) {
        std.log.warn(
            "Qt {s} found; Pulsar targets Qt {s}.x. The build may still work, but Qt {s}.x is recommended.",
            .{ version, qt_target, qt_target },
        );
    }
}

/// Best-effort clangd flags written next to the sources (gitignored).
fn writeCompileFlags(b: *std.Build, cflags: []const []const u8) void {
    var buf: std.ArrayList(u8) = .empty;
    defer buf.deinit(b.allocator);
    buf.appendSlice(b.allocator, "-std=c++20\n-xc++\n-fPIC\n-DQT_NO_EMIT\n") catch return;
    for (cflags) |f| {
        buf.appendSlice(b.allocator, f) catch return;
        buf.append(b.allocator, '\n') catch return;
    }
    std.Io.Dir.cwd().writeFile(b.graph.io, .{
        .sub_path = "host/compile_flags.txt",
        .data = buf.items,
    }) catch {};
}

fn compileCxx(
    b: *std.Build,
    cxx: []const u8,
    cflags: []const []const u8,
    src: std.Build.LazyPath,
    out_name: []const u8,
) std.Build.LazyPath {
    const c = b.addSystemCommand(&.{ cxx, "-std=c++20", "-fPIC", "-Ihost", "-DQT_NO_EMIT" });
    c.addArgs(cflags);
    c.addArg("-c");
    c.addFileArg(src);
    c.addArg("-o");
    return c.addOutputFileArg(out_name);
}

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    // The Qt host is always built for the host OS (Qt is a host library).
    // Only the Zig bridge follows -Dtarget.
    const host_os = b.graph.host.result.os.tag;
    const os = host_os;
    const target_os = target.result.os.tag;
    if (target_os != host_os)
        std.log.warn(
            "Qt host builds for the host OS ({s}); the Zig bridge targets {s}. " ++
                "Cross-compiling the Qt host needs a target Qt build, which is not supported yet.",
            .{ @tagName(host_os), @tagName(target_os) },
        );

    const qt_version = detectQtVersion(b) orelse reportMissingQt();
    requireQtVersion(qt_version);

    var cflags: std.ArrayList([]const u8) = .empty;
    if (pkgConfig(b, "--cflags")) |text| {
        tokenize(b, &cflags, text);
    } else {
        const hdr = qmakeQuery(b, "QT_INSTALL_HEADERS") orelse "/usr/include/qt6";
        for (fallback_includes) |m|
            cflags.append(b.allocator, std.fmt.allocPrint(b.allocator, "-I{s}/{s}", .{ hdr, m }) catch unreachable) catch {};
        cflags.append(b.allocator, std.fmt.allocPrint(b.allocator, "-I{s}", .{hdr}) catch unreachable) catch {};
        cflags.append(b.allocator, "-DQT_CORE_LIB") catch {};
        cflags.append(b.allocator, "-DQT_GUI_LIB") catch {};
        cflags.append(b.allocator, "-DQT_QML_LIB") catch {};
        cflags.append(b.allocator, "-DQT_QUICK_LIB") catch {};
        cflags.append(b.allocator, "-DQT_NETWORK_LIB") catch {};
        cflags.append(b.allocator, "-DQT_OPENGL_LIB") catch {};
    }

    var libs: std.ArrayList([]const u8) = .empty;
    if (pkgConfig(b, "--libs")) |text| {
        tokenize(b, &libs, text);
    } else {
        const libdir = qmakeQuery(b, "QT_INSTALL_LIBS") orelse "/usr/lib";
        libs.append(b.allocator, std.fmt.allocPrint(b.allocator, "-L{s}", .{libdir}) catch unreachable) catch {};
        libs.append(b.allocator, "-lQt6Quick") catch {};
        libs.append(b.allocator, "-lQt6OpenGL") catch {};
        libs.append(b.allocator, "-lQt6Qml") catch {};
        libs.append(b.allocator, "-lQt6Network") catch {};
        libs.append(b.allocator, "-lQt6Gui") catch {};
        libs.append(b.allocator, "-lQt6Core") catch {};
    }

    const exe_suffix: []const u8 = if (os == .windows) ".exe" else "";
    const moc = blk: {
        const libexec = qmakeQuery(b, "QT_HOST_LIBEXECS") orelse qmakeQuery(b, "QT_INSTALL_LIBEXECS");
        if (libexec) |d|
            break :blk std.fmt.allocPrint(b.allocator, "{s}/moc{s}", .{ d, exe_suffix }) catch "moc";
        break :blk "moc";
    };
    // Qt on Linux is libstdc++; on macOS libc++; MinGW g++ on Windows.
    const cxx: []const u8 = if (os == .macos) "clang++" else "g++";

    writeCompileFlags(b, cflags.items);

    // --- Zig bridge ---
    const zig_zig = b.createModule(.{
        .root_source_file = b.path("bridge/main.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    const bridge = b.addExecutable(.{ .name = "bridge", .root_module = zig_zig });
    b.installArtifact(bridge);

    // --- C++ host ---
    const moc_cmd = b.addSystemCommand(&.{ moc, "-Ihost", "-DQT_NO_EMIT" });
    moc_cmd.addArgs(cflags.items);
    moc_cmd.addFileArg(b.path("host/bridge.h"));
    moc_cmd.addArg("-o");
    const moc_cpp = moc_cmd.addOutputFileArg("bridge_moc.cpp");

    const main_o = compileCxx(b, cxx, cflags.items, b.path("host/main.cpp"), "main.o");
    const bridge_o = compileCxx(b, cxx, cflags.items, b.path("host/bridge.cpp"), "bridge.o");
    const log_o = compileCxx(b, cxx, cflags.items, b.path("host/log.cpp"), "log.o");
    const embedded_o = compileCxx(b, cxx, cflags.items, b.path("host/embedded.cpp"), "embedded.o");
    const moc_o = compileCxx(b, cxx, cflags.items, moc_cpp, "moc.o");

    const link = b.addSystemCommand(&.{cxx});
    link.addFileArg(main_o);
    link.addFileArg(bridge_o);
    link.addFileArg(log_o);
    link.addFileArg(embedded_o);
    link.addFileArg(moc_o);
    link.addArgs(libs.items);
    link.addArg("-o");
    const host_exe = link.addOutputFileArg("qml-host");

    const install = b.getInstallStep();
    install.dependOn(&link.step);
    const install_host = b.addInstallFile(host_exe, "bin/qml-host");
    install.dependOn(&install_host.step);

    const run_cmd = b.addSystemCommand(&.{"./zig-out/bin/qml-host"});
    run_cmd.step.dependOn(b.getInstallStep());
    const run_step = b.step("run", "Run QML host (starts Bun through Zig bridge)");
    run_step.dependOn(&run_cmd.step);

    _ = b.step("editor-config", "Regenerate host/compile_flags.txt for clangd");
}
