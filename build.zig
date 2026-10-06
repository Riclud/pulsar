const std = @import("std");

const qt_modules = [_][]const u8{
    "Qt6Core",    "Qt6Gui",    "Qt6Qml",            "Qt6Quick",
    "Qt6Network", "Qt6OpenGL", "Qt6QmlIntegration",
};

const fallback_includes = [_][]const u8{
    "QtCore", "QtGui", "QtQml", "QtQuick", "QtNetwork", "QtOpenGL", "QtQmlIntegration",
};

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
    var argv: std.ArrayList([]const u8) = .empty;
    defer argv.deinit(b.allocator);
    argv.append(b.allocator, "pkg-config") catch return null;
    argv.append(b.allocator, mode) catch return null;
    for (qt_modules) |m| argv.append(b.allocator, m) catch return null;
    const out = execCapture(b, argv.items) orelse return null;
    return if (out.len == 0) null else out;
}

/// qmake fallback for Qt paths (Windows MinGW, some macOS installs).
fn qmakeQuery(b: *std.Build, key: []const u8) ?[]const u8 {
    if (execCapture(b, &.{ "qmake6", "-query", key })) |v| {
        if (v.len > 0) return v;
    }
    if (execCapture(b, &.{ "qmake", "-query", key })) |v| {
        if (v.len > 0) return v;
    }
    return null;
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
    const os = target.result.os.tag;

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
    const moc_o = compileCxx(b, cxx, cflags.items, moc_cpp, "moc.o");

    const link = b.addSystemCommand(&.{cxx});
    link.addFileArg(main_o);
    link.addFileArg(bridge_o);
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
