import { createInterface } from "node:readline";
import { promises as fs } from "node:fs";

const handlers: Record<string, (p: any) => Promise<unknown>> = {
  "fs.readFile": async (p) => {
    const c = await fs.readFile(p.path, "utf8");
    return c;
  },
  "fs.writeFile": async (p) => {
    await fs.writeFile(p.path, p.content, "utf8");
    return true;
  },
  "fs.listDir": async (p) => {
    const entries = await fs.readdir(p.path ?? ".", { withFileTypes: true });
    return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
  },
  "fs.exists": async (p) => {
    try {
      await fs.access(p.path);
      return true;
    } catch {
      return false;
    }
  },
  "nw.fetch": async (p) => {
    const res = await fetch(p.url);
    const text = await res.text();
    return { status: res.status, url: res.url, text };
  },
};

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (raw) => {
  let req: any;
  try {
    req = JSON.parse(raw);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "parse error" },
    });
    return;
  }

  const handler = handlers[req.method];
  if (!handler) {
    send({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32601, message: "method not found: " + req.method },
    });
    return;
  }

  handler(req.params ?? {})
    .then((result) => send({ jsonrpc: "2.0", id: req.id, result }))
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message: msg },
      });
    });
});

console.error("[bun] backend ready (fs.* RPC)");
