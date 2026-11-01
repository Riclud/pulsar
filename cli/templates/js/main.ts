import { App, ui } from "pulsar"

interface Task {
  id: string
  text: string
  done: boolean
}

const app = new App()

const seed: Task[] = [
  { id: "1", text: "Try the JS UI", done: true },
  { id: "2", text: "Write my first app", done: false },
]

app.store.set("tasks", seed)
app.store.set("draft", "")
app.store.set("composing", false)
app.store.set("nextID", 3)

const tasks = (): Task[] => app.store.get("tasks") as Task[]

const save = (next: Task[]): void => {
  app.store.set("tasks", next)
}

const setDone = (id: string, done: boolean): void => {
  save(tasks().map((task) => (task.id === id ? { ...task, done } : task)))
}

const remove = (id: string): void => {
  save(tasks().filter((task) => task.id !== id))
}

const add = (): void => {
  const text = String(app.store.get("draft") ?? "").trim()

  if (!text) return

  const id = String(app.store.get("nextID") ?? 1)

  save([...tasks(), { id, text, done: false }])
  app.store.set("nextID", Number(id) + 1)
  app.store.set("draft", "")
  app.store.set("composing", false)
}

app.window("main").render(() => {
  const items = tasks()
  const composing = app.store.get("composing") === true
  const left = items.filter((task) => !task.done).length

  return ui.column({ fillWidth: true, fillHeight: true }, [
    ui.appBar({
      title: "My tasks",
      subtitle: `${left} left`,
      actions: [ui.iconButton("add", { onClick: () => app.store.set("composing", true) })],
    }),
    items.length === 0
      ? ui.text({ text: "Nothing here yet", size: 16 })
      : ui.list({
          items,
          keyOf: (task) => task.id,
          spacing: 8,
          padding: 12,
          render: (task) =>
            ui.card({ padding: 12 }, [
              ui.row({ gap: 8, fillWidth: true }, [
                ui.checkbox(task.text, { checked: task.done, onToggle: (done) => setDone(task.id, done) }),
                ui.spacer({ fillWidth: true }),
                ui.iconButton("delete", { onClick: () => remove(task.id) }),
              ]),
            ]),
        }),
    ui.sheet(
      {
        open: composing,
        title: "New task",
        fullscreen: true,
        onClose: () => app.store.set("composing", false),
      },
      [
        ui.textInput({
          placeholder: "What needs doing?",
          value: app.store.get("draft") as string,
          onInput: (value) => app.store.set("draft", value),
        }),
        ui.button("Add task", { expand: true, onClick: add }),
      ],
    ),
  ])
})

app.run()
