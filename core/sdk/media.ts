import { App } from "./app.ts"
import { callCapability } from "./caps.ts"

export type MediaState = "idle" | "loading" | "playing" | "paused" | "stopped" | "ended" | "error"

export interface MediaTrack {
  source: string
  title?: string
  artist?: string
  album?: string
  art?: string
}

export interface MediaSnapshot {
  state: MediaState
  position: number
  duration: number
  rate: number
  volume: number
  index: number
  source: string
  title: string
  artist: string
  playing: boolean
}

interface MediaPayload {
  state?: MediaState
  position?: number
  duration?: number
  rate?: number
  volume?: number
  title?: string
  artist?: string
  source?: string
  command?: "next" | "previous" | "toggle"
}

type MediaListener = (snapshot: MediaSnapshot) => void

/** One host-backed player shared by the whole app. */
export class MediaManager {
  private readonly tracks: MediaTrack[] = []
  private index = 0

  private readonly snapshot: MediaSnapshot = {
    state: "idle",
    position: 0,
    duration: 0,
    rate: 1,
    volume: 1,
    index: 0,
    source: "",
    title: "",
    artist: "",
    playing: false,
  }

  private readonly listeners = new Set<MediaListener>()

  constructor(readonly app: App) {
    app.on<MediaPayload>("media", (payload) => this.apply(payload))
    app.on<{ command?: string }>("media-command", (payload) => {
      if (payload.command === "next") this.next()
      else if (payload.command === "previous") this.previous()
      else if (payload.command === "toggle") this.toggle()
    })
  }

  /** Replace the playlist and start at `index` (does not start playback). */
  load(tracks: MediaTrack[], index = 0): void {
    this.tracks.length = 0
    this.tracks.push(...tracks)

    this.index = Math.max(0, Math.min(index, this.tracks.length - 1))
    this.snapshot.index = this.index

    const track = this.tracks[this.index]

    if (!track) {
      this.snapshot.state = "idle"
      this.notify()

      return
    }

    this.open(track)
  }

  play(): void {
    if (this.tracks.length === 0) return

    if (this.snapshot.state === "ended") this.seek(0)

    this.send({ action: "play" })
  }

  pause(): void {
    this.send({ action: "pause" })
  }

  toggle(): void {
    if (this.snapshot.playing) this.pause()
    else this.play()
  }

  stop(): void {
    this.send({ action: "stop" })
  }

  next(): void {
    if (this.tracks.length === 0) return

    this.index = (this.index + 1) % this.tracks.length
    this.open(this.tracks[this.index]!)
  }

  previous(): void {
    if (this.tracks.length === 0) return

    this.index = (this.index - 1 + this.tracks.length) % this.tracks.length
    this.open(this.tracks[this.index]!)
  }

  seek(position: number): void {
    this.send({ action: "seek", position })
  }

  setRate(rate: number): void {
    this.snapshot.rate = rate
    this.send({ action: "rate", rate })
  }

  setVolume(volume: number): void {
    const value = Math.max(0, Math.min(1, volume))

    this.snapshot.volume = value
    this.send({ action: "volume", volume: value })
  }

  /** Update the lockscreen/notification metadata without changing the track. */
  setMetadata(title: string, artist = ""): void {
    this.snapshot.title = title
    this.snapshot.artist = artist
    this.send({ action: "metadata", title, artist })
  }

  state(): MediaSnapshot {
    return { ...this.snapshot }
  }

  /** The playlist currently loaded. */
  playlist(): MediaTrack[] {
    return [...this.tracks]
  }

  on(listener: MediaListener): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  private open(track: MediaTrack): void {
    const wasPlaying = this.snapshot.playing

    this.snapshot.index = this.index
    this.snapshot.source = track.source
    this.snapshot.title = track.title ?? ""
    this.snapshot.artist = track.artist ?? ""
    this.snapshot.position = 0
    this.snapshot.duration = 0
    this.snapshot.state = "loading"

    this.send({
      action: "open",
      source: track.source,
      title: track.title ?? "",
      artist: track.artist ?? "",
      album: track.album ?? "",
      art: track.art ?? "",
    })

    if (wasPlaying) this.send({ action: "play" })

    this.notify()
  }

  private apply(payload: MediaPayload): void {
    if (payload.state !== undefined) this.snapshot.state = payload.state
    if (payload.position !== undefined) this.snapshot.position = payload.position
    if (payload.duration !== undefined) this.snapshot.duration = payload.duration
    if (payload.rate !== undefined) this.snapshot.rate = payload.rate
    if (payload.volume !== undefined) this.snapshot.volume = payload.volume
    if (payload.title !== undefined) this.snapshot.title = payload.title
    if (payload.artist !== undefined) this.snapshot.artist = payload.artist
    if (payload.source !== undefined) this.snapshot.source = payload.source

    this.snapshot.playing = this.snapshot.state === "playing"
    this.notify()
  }

  private send(params: Record<string, unknown>): void {
    void callCapability("media", params)
  }

  private notify(): void {
    const snapshot = this.state()

    for (const listener of this.listeners) listener(snapshot)
  }
}

let manager: MediaManager | null = null

const currentManager = (): MediaManager => {
  const app = App.current

  if (!app) throw new Error("media: create an App before using media")

  if (!manager || manager.app !== app) manager = new MediaManager(app)

  return manager
}

/** Host-backed audio/video playback with a JS playlist and lockscreen controls. */
export const media = {
  load: (tracks: MediaTrack[], index = 0): void => currentManager().load(tracks, index),
  play: (): void => currentManager().play(),
  pause: (): void => currentManager().pause(),
  toggle: (): void => currentManager().toggle(),
  stop: (): void => currentManager().stop(),
  next: (): void => currentManager().next(),
  previous: (): void => currentManager().previous(),
  seek: (position: number): void => currentManager().seek(position),
  setRate: (rate: number): void => currentManager().setRate(rate),
  setVolume: (volume: number): void => currentManager().setVolume(volume),
  setMetadata: (title: string, artist = ""): void => currentManager().setMetadata(title, artist),
  state: (): MediaSnapshot => currentManager().state(),
  playlist: (): MediaTrack[] => currentManager().playlist(),
  on: (listener: MediaListener): (() => void) => currentManager().on(listener),
}
