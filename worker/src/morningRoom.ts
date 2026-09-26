import type { ConnectionInfo, Env, StateSnapshot } from "./types"

const EMPTY_SNAPSHOT: StateSnapshot = {
    version: 0,
    session: { id: "", openAt: 0, closeAt: 0, requestCap: 2, requestOpen: true, autoplay: true, serverTime: 0 },
    nowPlaying: null,
    queue: [], played: []
}

interface Client {
    writer: WritableStreamDefaultWriter<Uint8Array>
    connId: string
    connectedAt: number
    isAdmin: boolean
    deviceId: string | null
}

export class MorningRoom {
    private state: DurableObjectState
    private clients: Map<string, Client>
    private encoder: TextEncoder

    constructor(state: DurableObjectState, _env: Env) {
        this.state = state
        this.clients = new Map()
        this.encoder = new TextEncoder()
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)
        if (url.pathname === "/events" && request.method === "GET") return this.handleSSE(url)
        if (url.pathname === "/connections" && request.method === "GET") {
            const list = this.listConnections()
            return new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json" } })
        }
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

    private listConnections(): ConnectionInfo[] {
        return Array.from(this.clients.values())
            .map((c) => ({ connId: c.connId, connectedAt: c.connectedAt, isAdmin: c.isAdmin, deviceId: c.deviceId }))
            .sort((a, b) => a.connectedAt - b.connectedAt)
    }

    private async handleSSE(url: URL): Promise<Response> {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
        const writer = writable.getWriter()

        const client: Client = {
            writer,
            connId: crypto.randomUUID(),
            connectedAt: Date.now(),
            isAdmin: url.searchParams.get("admin") === "1",
            deviceId: url.searchParams.get("deviceId"),
        }
        this.clients.set(client.connId, client)

        const snapshot = await this.getSnapshot()
        this.safeWrite(client, "state", snapshot)

        const heartbeat = setInterval(() => {
            writer.write(this.encoder.encode(": ping\n\n")).catch(() => {
                clearInterval(heartbeat)
                this.clients.delete(client.connId)
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

    private safeWrite(client: Client, event: string, data: unknown): void {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        client.writer.write(this.encoder.encode(payload)).catch(() => this.clients.delete(client.connId))
    }

    private async getSnapshot(): Promise<StateSnapshot> {
        const stored = await this.state.storage.get<StateSnapshot>("snapshot")
        return stored ?? EMPTY_SNAPSHOT
    }

    private async applySnapshot(snapshot: StateSnapshot): Promise<void> {
        await this.state.storage.put("snapshot", snapshot)
        for (const client of this.clients.values()) this.safeWrite(client, "state", snapshot)
    }
}
