import { App, Column, Text, component } from "../../../core/sdk/index.ts"

const app = new App()

const Title = component<{ text: string }>((props) => {
  return <Text size={20}>{props.text}</Text>
})

const screen = (
  <Column key="root">
    <Title text="One" />
    <Text>Two</Text>
  </Column>
)

app.window("main").render(() => screen)

console.log(`JSX_OK ${screen.children?.length}`)
