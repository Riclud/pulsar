import { App } from "pulsar";

const app = new App({
  ui: "ui/main.qml",
  width: 640,
  height: 480,
  title: "Hello Pulsar",
});

app.store.set("greeting", "Hello, Pulsar");

app.handle("greet", async (params: { name: string }) => {
  return `Hello, ${params.name}!`;
});

app.run();
