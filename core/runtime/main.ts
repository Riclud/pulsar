import { createInterface } from "node:readline";
import { capabilities } from "../caps/index.ts";

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

  const handler = capabilities[req.method];
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

console.error("[bun] backend ready");
