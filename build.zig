const std = @import("std");

const qt_cflags = [_][]const u8{
    "-I/usr/include/qt6",
    "-I/usr/include/qt6/QtCore",
    "-I/usr/include/qt6/QtGui",
    "-I/usr/include/qt6/QtQml",
    "-I/usr/include/qt6/QtQuick",
    "-I/usr/include/qt6/QtNetwork",
    "-DQT_CORE_LIB",
    "-DQT_GUI_LIB",
    "-DQT_QML_LIB",
    "-DQT_QUICK_LIB",
    "-DQT_NETWORK_LIB",
    "-DQT_NO_EMIT",
};

fn compileCxx(b: *std.Build, src: std.Build.LazyPath, out_name: []const u8) std.Build.LazyPath {
    const c = b.addSystemCommand(&.{ "g++", "-std=c++20", "-fPIC", "-Ihost", "-c" });
    c.addArgs(&qt_cflags);
    c.addFileArg(src);
    c.addArg("-o");
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

    const moc = b.addSystemCommand(&.{ "/usr/lib/qt6/moc", "-Ihost" });
    moc.addArgs(&qt_cflags);
    moc.addFileArg(b.path("host/bridge.h"));
    moc.addArg("-o");
    const moc_cpp = moc.addOutputFileArg("bridge_moc.cpp");

    const main_o = compileCxx(b, b.path("host/main.cpp"), "main.o");
    const bridge_o = compileCxx(b, b.path("host/bridge.cpp"), "bridge.o");
    const moc_o = compileCxx(b, moc_cpp, "moc.o");

    const link = b.addSystemCommand(&.{ "g++" });
    link.addFileArg(main_o);
    link.addFileArg(bridge_o);
    link.addFileArg(moc_o);
    link.addArg("-o");
    const host_exe = link.addOutputFileArg("qml-host");
    link.addArg("-lQt6Quick");
    link.addArg("-lQt6OpenGL");
    link.addArg("-lQt6Qml");
    link.addArg("-lQt6Network");
    link.addArg("-lQt6Gui");
    link.addArg("-lQt6Core");

    const install = b.getInstallStep();
    install.dependOn(&link.step);
    const install_host = b.addInstallFile(host_exe, "bin/qml-host");
    install.dependOn(&install_host.step);

    const run_cmd = b.addSystemCommand(&.{ "./zig-out/bin/qml-host" });
    run_cmd.step.dependOn(b.getInstallStep());
    const run_step = b.step("run", "Run QML host (starts Bun through Zig bridge)");
    run_step.dependOn(&run_cmd.step);
}