const std = @import("std");

const kBufSize = 1 << 16;

/// State shared between the supervisor task and the Bun -> host pump.
const Shared = struct {
    /// Set once the host closes our stdin, i.e. it is shutting us down.
    shutting_down: std.atomic.Value(bool) = .init(false),
    /// Serializes writes to the host on stdout (responses vs. crash report).
    stdout_lock: std.Io.Mutex = .init,
};

/// Upper bound for a single protocol line. Lines are streamed through without
/// buffering, so this only guards against runaway or hostile input.
const kMaxLine: usize = 64 << 20; // 64 MiB

/// Streams one newline-terminated line from `src` to `dst`. Empty lines are
/// skipped. Returns true while there may be more input.
fn pumpLine(src: *std.Io.Reader, dst: *std.Io.Writer) bool {
    const n = src.streamDelimiterLimit(dst, '\n', .limited(kMaxLine)) catch |e| switch (e) {
        error.StreamTooLong => {
            std.log.err("bridge: message exceeds {d} bytes; closing channel", .{kMaxLine});
            return false;
        },
        error.ReadFailed, error.WriteFailed => return false,
    };

    // An empty buffer means the stream ended.
    if (src.seek == src.end) {
        if (n == 0) return false;
        dst.writeByte('\n') catch return false; // trailing, unterminated line
        dst.flush() catch return false;
        return false;
    }

    src.toss(1); // consume the delimiter, which the stream leaves untouched
    if (n == 0) return true; // skip empty lines
    dst.writeByte('\n') catch return false;
    dst.flush() catch return false;
    return true;
}

/// Forwards lines from the host (stdin) into Bun's stdin.
fn pumpHostToBun(
    host_reader: *std.Io.File.Reader,
    bun_writer: *std.Io.File.Writer,
) std.Io.Cancelable!void {
    while (pumpLine(&host_reader.interface, &bun_writer.interface)) {}
}

/// Forwards every line Bun writes to stdout (responses *and* unsolicited
/// notifications) to the host.
fn pumpBunToHost(
    io: std.Io,
    bun_reader: *std.Io.File.Reader,
    host_writer: *std.Io.File.Writer,
    shared: *Shared,
) std.Io.Cancelable!void {
    while (true) {
        try shared.stdout_lock.lock(io);
        const more = pumpLine(&bun_reader.interface, &host_writer.interface);
        shared.stdout_lock.unlock(io);
        if (!more) return;
    }
}

/// Tells the host that Bun died on its own. `__crash` is an unsolicited
/// notification (no `id`), so the host treats it like `__error`.
fn notifyCrash(io: std.Io, shared: *Shared, term: std.process.Child.Term) void {
    var msg_buf: [192]u8 = undefined;
    const json = switch (term) {
        .exited => |code| std.fmt.bufPrint(
            &msg_buf,
            "{{\"jsonrpc\":\"2.0\",\"method\":\"__crash\",\"params\":{{\"scope\":\"bun\",\"kind\":\"exited\",\"code\":{d}}}}}\n",
            .{code},
        ) catch return,
        .signal => |sig| std.fmt.bufPrint(
            &msg_buf,
            "{{\"jsonrpc\":\"2.0\",\"method\":\"__crash\",\"params\":{{\"scope\":\"bun\",\"kind\":\"signal\",\"signal\":{d}}}}}\n",
            .{@intFromEnum(sig)},
        ) catch return,
        else => std.fmt.bufPrint(
            &msg_buf,
            "{{\"jsonrpc\":\"2.0\",\"method\":\"__crash\",\"params\":{{\"scope\":\"bun\",\"kind\":\"unknown\"}}}}\n",
            .{},
        ) catch return,
    };

    shared.stdout_lock.lockUncancelable(io);
    defer shared.stdout_lock.unlock(io);

    var wbuf: [256]u8 = undefined;
    var writer = std.Io.File.stdout().writerStreaming(io, &wbuf);
    writer.interface.writeAll(json) catch {};
    writer.interface.flush() catch {};
}

fn exitCodeFor(term: std.process.Child.Term) u8 {
    return switch (term) {
        // A clean Bun exit while the host is still connected is still a
        // crash from the host's point of view; report it as a failure.
        .exited => |code| if (code == 0) 1 else code,
        else => 1,
    };
}

/// Waits for Bun. If Bun dies while the host is still connected, report the
/// crash and fail. If the host is shutting down, let the caller clean up.
fn superviseBun(
    io: std.Io,
    child: *std.process.Child,
    shared: *Shared,
) std.Io.Cancelable!void {
    const term = child.wait(io) catch |e| {
        if (e == error.Canceled) return;
        if (!shared.shutting_down.load(.acquire)) {
            notifyCrash(io, shared, .{ .unknown = 0 });
            std.process.exit(1);
        }
        return;
    };
    if (shared.shutting_down.load(.acquire)) return;
    notifyCrash(io, shared, term);
    std.process.exit(exitCodeFor(term));
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

    const argv: []const []const u8 = &.{ bun_bin, server_path };

    var bun = std.process.spawn(init.io, .{
        .argv = argv,
        .cwd = .{ .path = project_root },
        .stdin = .pipe,
        .stdout = .pipe,
        .stderr = .inherit,
    }) catch |e| return e;
    // Safety net for the normal path. If we exit abruptly instead, Bun sees
    // stdin EOF (the pipe closes with us) and exits on its own.
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

    var shared: Shared = .{};

    // Bun -> host and Bun supervision run concurrently; host -> Bun runs on
    // the main task until the host closes our stdin.
    var group: std.Io.Group = .init;
    group.async(init.io, pumpBunToHost, .{ init.io, &bun_reader, &stdout_writer, &shared });
    group.async(init.io, superviseBun, .{ init.io, &bun, &shared });

    pumpHostToBun(&stdin_reader, &bun_writer) catch {};

    // Host is going away. Exiting closes Bun's stdin, and the runtime exits
    // when its stdin closes, so no orphan process is left behind.
    shared.shutting_down.store(true, .release);
    std.process.exit(0);
}
