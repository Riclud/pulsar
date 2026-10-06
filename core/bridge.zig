const std = @import("std");

const kBufSize = 1 << 16;

fn extractId(s: []const u8) ?i64 {
    const idx = std.mem.indexOf(u8, s, "\"id\":") orelse return null;
    var i = idx + 5;
    while (i < s.len and (s[i] == ' ' or s[i] == '\t')) i += 1;
    const beg = i;
    while (i < s.len and s[i] >= '0' and s[i] <= '9') i += 1;
    if (i == beg) return null;
    return std.fmt.parseInt(i64, s[beg..i], 10) catch null;
}

pub fn main(init: std.process.Init) !void {
    const allocator = init.arena.allocator();

    var args_it = try std.process.Args.Iterator.initAllocator(init.minimal.args, allocator);
    defer args_it.deinit();

    _ = args_it.next();
    const current_dir: []const u8 = ".";
    const project_root: []const u8 = if (args_it.next()) |a|
        try allocator.dupe(u8, a)
    else
        current_dir;

    const bun_bin = init.environ_map.get("BUN_BIN") orelse "bun";
    const server_path = try std.fs.path.join(allocator, &.{ project_root, "backend", "server.ts" });

    var bun = std.process.spawn(init.io, .{
        .argv = &.{ bun_bin, "--watch", server_path },
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

    while (true) {
        const line = stdin_reader.interface.takeDelimiter('\n') catch break orelse break;
        if (line.len == 0) break;

        if (std.mem.indexOf(u8, line, "\"method\":\"zig.ping\"") != null) {
            if (extractId(line)) |n| {
                const resp = try std.fmt.allocPrint(allocator, "{{\"jsonrpc\":\"2.0\",\"id\":{d},\"result\":\"pong\"}}\n", .{n});
                stdout_writer.interface.writeAll(resp) catch break;
                stdout_writer.interface.flush() catch break;
            }
            continue;
        }

        bun_writer.interface.writeAll(line) catch break;
        bun_writer.interface.writeAll("\n") catch break;
        bun_writer.interface.flush() catch break;

        const resp = bun_reader.interface.takeDelimiter('\n') catch break orelse break;
        stdout_writer.interface.writeAll(resp) catch break;
        stdout_writer.interface.writeAll("\n") catch break;
        stdout_writer.interface.flush() catch break;
    }
}