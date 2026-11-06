import { App, Box, Column, For, Input, Row, Text, signal, theme } from "pulsar"

const ACCENT = "#7aa2f7"
const RADIUS = 4

void theme.set({ palette: { background: "#0e0f12", primary: ACCENT, text: "#c8ccd4", border: "#23262d" } })

const tasks = signal([
  { id: 1, text: "Write the README", done: true },
  { id: 2, text: "Record the demo", done: false },
  { id: 3, text: "Ship Pulsar", done: false },
])
const draft = signal("")
const hideDone = signal(false)

const add = () => {
  tasks.set([...tasks.get(), { id: Date.now(), text: draft.get(), done: false }])
  draft.set("")
}

const toggle = (id: number) => {
  tasks.set(tasks.get().map((task) => (task.id === id ? { ...task, done: !task.done } : task)))
}

const visible = () => tasks.get().filter((task) => !hideDone.get() || !task.done)

const TaskRow = (props: { id: number; text: string; done: boolean }) => (
  <Row gap={12} paddingY={8} alignItems="center" onClick={() => toggle(props.id)}>
    <Box width={16} height={16} radius={RADIUS} color={props.done ? ACCENT : "#23262d"} />
    <Text text={props.text} strike={props.done} color={props.done ? "#5c6370" : "#c8ccd4"} />
  </Row>
)

new App().window("main").render(() => (
  <Column fillWidth fillHeight padding={32} gap={16}>
    <Text text="Tasks" size={28} bold color={ACCENT} />
    <Input
      value={draft.get()}
      placeholder="Add a task"
      variant="outline"
      radius={RADIUS}
      autoFocus
      onInput={(value) => draft.set(value)}
      onSubmitted={add}
    />
    <For each={visible} keyOf={(task) => task.id} render={(task) => <TaskRow {...task} />} />
  </Column>
))
