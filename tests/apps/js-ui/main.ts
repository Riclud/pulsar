import {
  App,
  Button,
  Card,
  Checkbox,
  Column,
  component,
  For,
  Header,
  IconButton,
  Input,
  Sheet,
  Row,
  Spacer,
  Text,
} from "../../../core/sdk/index.ts"

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

const setDone = (id: string, done: boolean): void => {
  app.store.set(
    "tasks",
    (app.store.get("tasks") as Task[]).map((task) => (task.id === id ? { ...task, done } : task)),
  )
}

const remove = (id: string): void => {
  app.store.set(
    "tasks",
    (app.store.get("tasks") as Task[]).filter((task) => task.id !== id),
  )
}

const TaskRow = component<{ task: Task }>(({ task }) =>
  Card(
    { padding: 12 },
    Row(
      { gap: 8, fillWidth: true },
      Checkbox({
        label: task.text,
        checked: task.done,
        onToggle: (done) => setDone(task.id, done),
      }),
      Spacer({ fillWidth: true }),
      IconButton({ icon: "delete", onClick: () => remove(task.id) }),
    ),
  ),
)

setTimeout(() => {
  const current = app.store.get("tasks") as Task[]

  app.store.set("tasks", [...current, { id: "three", text: "Added later", done: false }])
  app.store.set("mutated", true)
}, 400)

app.window("main").render(() => {
  const items = app.store.get("tasks") as Task[]
  const left = items.filter((task) => !task.done).length

  return Column(
    { fill: true },
    Header({
      title: "Tasks",
      subtitle: `${left} left`,
      actions: [
        IconButton({
          icon: "add",
          onClick: () => {
            app.store.set("count", ((app.store.get("count") as number) ?? 0) + 1)
            app.store.set("open", true)
          },
        }),
      ],
    }),
    items.length === 0
      ? Text({ size: 16 }, "Nothing here yet")
      : For({
        each: items,
        keyOf: (task) => task.id,
        spacing: 8,
        padding: 12,
        render: (task) => TaskRow({ task }),
      }),
    Sheet(
      {
        open: app.store.get("open") === true,
        title: "Edit task",
        fullscreen: true,
        onClose: () => app.store.set("open", false),
      },
      Input({ placeholder: "Task text" }),
      Button({ expand: true, onClick: () => app.store.set("open", false) }, "Close"),
    ),
  )
})

app.run()
