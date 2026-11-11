import { App, Avatar, Badge, Column, Divider, Progress, Spinner } from "../../../core/sdk/index.ts"

const app = new App()

app.store.set("value", 0.25)

app.window("main").render(() => {
  return Column(
    { key: "root", gap: 6 },
    Divider({ color: "#445566" }),
    Divider(),
    Progress({ key: "bar", value: app.store.get("value") as number }),
    Progress({ key: "busy", value: 2, color: "#336699", width: 100 }),
    Spinner({ key: "spin", size: 30, color: "#aa3300", thickness: 4 }),
    Spinner({ key: "ring", value: 0.5 }),
    Badge({ key: "count", count: 120 }),
    Badge({ key: "label", label: "new", color: "#336699", textColor: "#ffffff" }),
    Badge({ key: "dot", dot: true }),
    Avatar({ key: "ana", name: "Ana Maria Lopez", size: 48, status: "online" }),
    Avatar({ key: "anon" }),
  )
})

setTimeout(() => app.store.set("value", 0.75), 1000)
