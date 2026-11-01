import {
  App,
  bind,
  defineComponent,
  Button,
  Card,
  Checkbox,
  Column,
  For,
  Header,
  IconButton,
  Input,
  Modal,
  Row,
  Spacer,
  Text,
  When,
} from "pulsar"

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

const TaskRow = defineComponent<{ task: Task }>(({ task }) =>
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

app.window("main").render(() => {
  const items = tasks()
  const left = items.filter((task) => !task.done).length

  return Column(
    { fill: true },
    Header({
      title: "My tasks",
      subtitle: bind(() => `${left} left`),
      actions: [IconButton({ icon: "add", onClick: () => app.store.set("composing", true) })],
    }),
    When({
      test: items.length === 0,
      then: () => Text({ size: 16 }, "Nothing here yet"),
      else: () =>
        For({
          each: items,
          keyOf: (task) => task.id,
          spacing: 8,
          padding: 12,
          render: (task) => TaskRow({ task }),
        }),
    }),
    Modal(
      {
        open: bind(() => app.store.get("composing") === true),
        title: "New task",
        fullscreen: true,
        onClose: () => app.store.set("composing", false),
      },
      Input({
        placeholder: "What needs doing?",
        value: app.store.get("draft") as string,
        onInput: (value) => app.store.set("draft", value),
      }),
      Button({ expand: true, onClick: add }, "Add task"),
    ),
  )
})

app.run()
