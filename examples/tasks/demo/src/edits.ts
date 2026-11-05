export interface Edit {
  find: string
  replace: string
}

const TITLE = "bold color={ACCENT} />"
const COUNT = '\n    <Text text={`${visible().length} open`} color="#5c6370" />'

/** Each group is typed in order, then saved, and the app reloads from that file. */
export const SCRIPT: Edit[][] = [
  [{ find: '"#7aa2f7"', replace: '"#e0af68"' }],
  [{ find: "RADIUS = 4", replace: "RADIUS = 7" }],
  [{ find: 'text="Tasks"', replace: 'text="Today"' }],
  [{ find: TITLE, replace: TITLE + COUNT }],
  [{ find: "gap={16}", replace: "gap={28}" }],
  [{ find: "hideDone = signal(false)", replace: "hideDone = signal(true)" }],
]
