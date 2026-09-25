import type { Env, StateSnapshot } from "./types"

const EMPTY_SNAPSHOT: StateSnapshot = {
    version: 0,
    session: { id: "", openAt: 0, closeAt: 0, requestCap: 2, requestOpen: true, serverTime: 0 },
    nowPlaying: null,
    queue: [], played: []
}

export class MorningRoom {
    private state: DurableObjectState
    private clients: Set<WritableStreamDefaultWriter<Uint8Array>>
    private encoder: TextEncoder

    constructor(state: DurableObjectState, _env: Env) {
        this.state = state
        this.clients = new Set()
        this.encoder = new TextEncoder()
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)
        if (url.pathname === "/events" && request.method === "GET") return this.handleSSE()
        if (url.pathname === "/state" && request.method === "GET") {
            const snap = await this.getSnapshot()
            return new Response(JSON.stringify(snap), { headers: { "Content-Type": "application/json" } })
        }
        if (url.pathname === "/sync" && request.method === "POST") {
            const body = (await request.json()) as StateSnapshot
            await this.applySnapshot(body)
            return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
        }
        return new Response("not found", { status: 404 })
    }

    private async handleSSE(): Promise<Response> {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
        const writer = writable.getWriter()
        this.clients.add(writer)

        const snapshot = await this.getSnapshot()
        this.safeWrite(writer, "state", snapshot)

        const heartbeat = setInterval(() => {
            writer.write(this.encoder.encode(": ping\n\n")).catch(() => {
                clearInterval(heartbeat)
                this.clients.delete(writer)
            })
        }, 15000)

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            }
        })
    }

    private safeWrite(writer: WritableStreamDefaultWriter<Uint8Array>, event: string, data: unknown): void {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        writer.write(this.encoder.encode(payload)).catch(() => this.clients.delete(writer))
    }

    private async getSnapshot(): Promise<StateSnapshot> {
        const stored = await this.state.storage.get<StateSnapshot>("snapshot")
        return stored ?? EMPTY_SNAPSHOT
    }

    private async applySnapshot(snapshot: StateSnapshot): Promise<void> {
        await this.state.storage.put("snapshot", snapshot)
        for (const writer of this.clients) this.safeWrite(writer, "state", snapshot)
    }
}
