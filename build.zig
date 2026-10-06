const std = @import("std");

// g++ is used (not Zig's C++ frontend) to stay on libstdc++, matching system Qt.
// Qt flags/paths are resolved at build time via scripts/ (pkg-config, qmake6).

fn compileCxx(b: *std.Build, src: std.Build.LazyPath, out_name: []const u8) std.Build.LazyPath {
    const c = b.addSystemCommand(&.{
        "sh",
        "-c",
        "exec g++ -std=c++20 -fPIC -Ihost -DQT_NO_EMIT $(sh scripts/qt-flags.sh) -c \"$1\" -o \"$2\"",
        "sh",
    });
    c.addFileArg(src);
    return c.addOutputFileArg(out_name);
}

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const zig_zig = b.createModule(.{
        .root_source_file = b.path("bridge/main.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });
    const bridge = b.addExecutable(.{ .name = "bridge", .root_module = zig_zig });
    b.installArtifact(bridge);

    const moc = b.addSystemCommand(&.{
        "sh",
        "-c",
        "exec \"$(sh scripts/qt-moc.sh)\" -Ihost -DQT_NO_EMIT $(sh scripts/qt-flags.sh) \"$1\" -o \"$2\"",
        "sh",
    });
    moc.addFileArg(b.path("host/bridge.h"));
    const moc_cpp = moc.addOutputFileArg("bridge_moc.cpp");

    const main_o = compileCxx(b, b.path("host/main.cpp"), "main.o");
    const bridge_o = compileCxx(b, b.path("host/bridge.cpp"), "bridge.o");
    const moc_o = compileCxx(b, moc_cpp, "moc.o");

    const link = b.addSystemCommand(&.{
        "sh",
        "-c",
        "out=\"$1\"; shift; exec g++ \"$@\" $(sh scripts/qt-libs.sh) -o \"$out\"",
        "sh",
    });
    const host_exe = link.addOutputFileArg("qml-host");
    link.addFileArg(main_o);
    link.addFileArg(bridge_o);
    link.addFileArg(moc_o);

    const install = b.getInstallStep();
    install.dependOn(&link.step);
    const install_host = b.addInstallFile(host_exe, "bin/qml-host");
    install.dependOn(&install_host.step);

    const run_cmd = b.addSystemCommand(&.{"./zig-out/bin/qml-host"});
    run_cmd.step.dependOn(b.getInstallStep());
    const run_step = b.step("run", "Run QML host (starts Bun through Zig bridge)");
    run_step.dependOn(&run_cmd.step);

    const gen_flags = b.addSystemCommand(&.{ "sh", "scripts/gen-compile-flags.sh" });
    const editor_step = b.step("editor-config", "Generate host/compile_flags.txt for clangd");
    editor_step.dependOn(&gen_flags.step);
}
