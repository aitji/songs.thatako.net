import type { Env, StateSnapshot } from "./types"
import { stripDeviceIds } from "./utils"

const EMPTY_SNAPSHOT: StateSnapshot = {
    version: 0,
    session: { id: "", openAt: 0, closeAt: 0, requestCap: 2, requestOpen: true, autoplay: true, serverTime: 0 },
    nowPlaying: null,
    queue: [], played: []
}

interface Client {
    controller: ReadableStreamDefaultController<Uint8Array>
    connId: string
    isAdmin: boolean
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

    private handleSSE(url: URL): Response {
        const client: Client = {
            controller: null as unknown as ReadableStreamDefaultController<Uint8Array>,
            connId: crypto.randomUUID(),
            isAdmin: url.searchParams.get("admin") === "1",
        }

        let heartbeat: ReturnType<typeof setInterval> | null = null
        const stream = new ReadableStream<Uint8Array>({
            start: async (controller) => {
                client.controller = controller
                this.clients.set(client.connId, client)

                const snapshot = await this.getSnapshot()
                this.safeEnqueue(client, "state", client.isAdmin ? snapshot : stripDeviceIds(snapshot))

                heartbeat = setInterval(() => {
                    try { controller.enqueue(this.encoder.encode(": ping\n\n")) }
                    catch { this.dropClient(client.connId, heartbeat) }
                }, 15000)
            },
            cancel: () => this.dropClient(client.connId, heartbeat),
        })

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            }
        })
    }

    private dropClient(connId: string, heartbeat: ReturnType<typeof setInterval> | null): void {
        if (heartbeat) clearInterval(heartbeat)
        this.clients.delete(connId)
    }

    private safeEnqueue(client: Client, event: string, data: unknown): void {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        try { client.controller.enqueue(this.encoder.encode(payload)) }
        catch { this.clients.delete(client.connId) }
    }

    private async getSnapshot(): Promise<StateSnapshot> {
        const stored = await this.state.storage.get<StateSnapshot>("snapshot")
        return stored ?? EMPTY_SNAPSHOT
    }

    private async applySnapshot(snapshot: StateSnapshot): Promise<void> {
        await this.state.storage.put("snapshot", snapshot)
        const publicSnapshot = stripDeviceIds(snapshot)
        for (const client of this.clients.values()) {
            this.safeEnqueue(client, "state", client.isAdmin ? snapshot : publicSnapshot)
        }
    }
}
