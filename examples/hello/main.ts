import { App } from "pulsar";

const app = new App({
  ui: "ui/main.qml",
  width: 640,
  height: 480,
  title: "Hello Pulsar",
});

app.store.set("greeting", "Hello, Pulsar");
app.store.set("error", "");

app.on("greet", (params: { name: string }) => {
  try {
    app.store.set("greeting", `Hello, ${params.name}!`);
    app.store.set("error", "");
  } catch (e) {
    app.store.set("error", e instanceof Error ? e.message : String(e));
  }
});

app.run();
