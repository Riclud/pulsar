const UPSTREAM = "https://raw.githubusercontent.com/riclud/pulsar/main"

const ROUTES: Record<string, string> = {
  "/": "/install.sh",
  "/install.sh": "/install.sh",
  "/install.ps1": "/install.ps1",
}

const CONTENT_TYPES: Record<string, string> = {
  ".sh": "text/x-shellscript; charset=utf-8",
  ".ps1": "text/plain; charset=utf-8",
}

interface WorkerHandler {
  fetch: (request: Request) => Promise<Response>
}

const handler: WorkerHandler = {
  fetch: async (request) => {
    const url = new URL(request.url)
    const target = ROUTES[url.pathname]

    if (!target) return new Response("not found\n", { status: 404 })

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed\n", { status: 405 })
    }

    const upstreamURL = `${UPSTREAM}${target}`
    const ext = target.slice(target.lastIndexOf("."))

    const res = await fetch(upstreamURL)

    if (!res.ok) {
      return new Response(`upstream ${res.status}\n`, { status: 502 })
    }

    return new Response(res.body, {
      headers: {
        "content-type": CONTENT_TYPES[ext] ?? "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
      },
    })
  },
}

export default handler
