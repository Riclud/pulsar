import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { capabilities } from "../caps/index.ts";
import { App } from "../sdk/index.ts";

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const appDir = resolve(process.env.PULSAR_APP ?? "examples/hello");
const entry = resolve(appDir, "main.ts");

try {
  await import(pathToFileURL(entry).href);
} catch (e) {
  console.error("[pulsar] failed to load app:", e);
}
console.error(`[pulsar] app loaded: ${appDir}`);

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

  const app = App.current;
  const handler = capabilities[req.method] ?? app?.resolve(req.method);
  if (!handler) {
    send({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32601, message: "method not found: " + req.method },
    });
    return;
  }

  Promise.resolve(handler(req.params ?? {}))
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
