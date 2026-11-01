import { App, ui } from "../../../core/sdk/index.ts"

interface Task {
  id: string
  text: string
  done: boolean
}

const app = new App()

const tasks: Task[] = [
  { id: "one", text: "Buy milk", done: false },
  { id: "two", text: "Ship Pulsar", done: true },
]

app.store.set("count", 0)
app.store.set("open", false)
app.store.set("mutated", false)
app.store.set("tasks", tasks)

setTimeout(() => {
  const current = app.store.get("tasks") as Task[]

  app.store.set("tasks", [...current, { id: "three", text: "Added later", done: false }])
  app.store.set("mutated", true)
}, 400)

app.window("main").render(() =>
  ui.column({ fillWidth: true, fillHeight: true }, [
    ui.appBar({
      title: "Tasks",
      subtitle: "JS UI",
      actions: [
        ui.iconButton("add", {
          onClick: () => {
            app.store.set("count", ((app.store.get("count") as number) ?? 0) + 1)
            app.store.set("open", true)
          },
        }),
      ],
    }),
    ui.list({
      items: app.store.get("tasks") as Task[],
      keyOf: (task) => task.id,
      spacing: 8,
      padding: 12,
      render: (task) =>
        ui.card({ padding: 12 }, [
          ui.row({ gap: 8, fillWidth: true }, [
            ui.icon(task.done ? "check_circle" : "radio_button_unchecked", { color: "#6750a4" }),
            ui.text(task.text),
            ui.spacer({ fillWidth: true }),
            ui.chip(task.done ? "done" : "todo"),
          ]),
        ]),
    }),
    ui.sheet(
      {
        open: app.store.get("open") === true,
        title: "Edit task",
        fullscreen: true,
        onClose: () => app.store.set("open", false),
      },
      [ui.textInput({ placeholder: "Task text" }), ui.button("Close", { onClick: () => app.store.set("open", false) })],
    ),
  ]),
)

app.run()
