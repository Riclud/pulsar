import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { capabilities } from "../caps/index.ts";
import { App } from "../sdk/index.ts";

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function currentState(): Record<string, unknown> {
  return App.current ? App.current.store.snapshot() : {};
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

rl.on("line", async (raw) => {
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
  try {
    let result: unknown = null;

    if (req.method === "__sync") {
      result = true;
    } else if (app?.hasEvent(req.method)) {
      app.dispatchEvent(req.method, req.params ?? {});
      result = true;
    } else {
      const cap = capabilities[req.method];
      if (!cap) throw new Error("method not found: " + req.method);
      result = await cap(req.params ?? {});
    }

    send({ jsonrpc: "2.0", id: req.id, result, state: currentState() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    send({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32000, message: msg },
      state: currentState(),
    });
  }
});
