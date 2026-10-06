const std = @import("std");

const kBufSize = 1 << 16;

/// Forwards lines from the host (stdin) into Bun's stdin.
fn pumpHostToBun(
    host_reader: *std.Io.File.Reader,
    bun_writer: *std.Io.File.Writer,
) std.Io.Cancelable!void {
    while (true) {
        const maybe = host_reader.interface.takeDelimiter('\n') catch return;
        const line = maybe orelse return;
        if (line.len == 0) continue;
        bun_writer.interface.writeAll(line) catch return;
        bun_writer.interface.writeAll("\n") catch return;
        bun_writer.interface.flush() catch return;
    }
}

/// Forwards every line Bun writes to stdout (responses *and* unsolicited
/// notifications) to the host.
fn pumpBunToHost(
    bun_reader: *std.Io.File.Reader,
    host_writer: *std.Io.File.Writer,
) std.Io.Cancelable!void {
    while (true) {
        const maybe = bun_reader.interface.takeDelimiter('\n') catch return;
        const line = maybe orelse return;
        if (line.len == 0) continue;
        host_writer.interface.writeAll(line) catch return;
        host_writer.interface.writeAll("\n") catch return;
        host_writer.interface.flush() catch return;
    }
}

pub fn main(init: std.process.Init) !void {
    const allocator = init.arena.allocator();

    var args_it = try std.process.Args.Iterator.initAllocator(init.minimal.args, allocator);
    defer args_it.deinit();

    _ = args_it.next();
    const project_root: []const u8 = if (args_it.next()) |a|
        try allocator.dupe(u8, a)
    else
        ".";

    const bun_bin = init.environ_map.get("BUN_BIN") orelse "bun";
    const server_path = try std.fs.path.join(allocator, &.{ project_root, "core", "runtime", "main.ts" });

    const watch = init.environ_map.get("PULSAR_WATCH") != null;
    const argv: []const []const u8 = if (watch)
        &.{ bun_bin, "--watch", server_path }
    else
        &.{ bun_bin, server_path };

    var bun = std.process.spawn(init.io, .{
        .argv = argv,
        .cwd = .{ .path = project_root },
        .stdin = .pipe,
        .stdout = .pipe,
        .stderr = .inherit,
    }) catch |e| return e;
    defer bun.kill(init.io);

    const bun_in = bun.stdin orelse return error.NoBunStdin;
    const bun_out = bun.stdout orelse return error.NoBunStdout;

    var in_buf: [kBufSize]u8 = undefined;
    var out_buf: [kBufSize]u8 = undefined;
    var bun_wbuf: [kBufSize]u8 = undefined;
    var bun_rbuf: [kBufSize]u8 = undefined;

    var stdin_reader = std.Io.File.stdin().readerStreaming(init.io, &in_buf);
    var stdout_writer = std.Io.File.stdout().writerStreaming(init.io, &out_buf);
    var bun_writer = bun_in.writerStreaming(init.io, &bun_wbuf);
    var bun_reader = bun_out.readerStreaming(init.io, &bun_rbuf);

    // Bun -> host runs concurrently; host -> Bun runs on the main task.
    var group: std.Io.Group = .init;
    group.async(init.io, pumpBunToHost, .{ &bun_reader, &stdout_writer });
    pumpHostToBun(&stdin_reader, &bun_writer) catch {};
    group.cancel(init.io);
}
