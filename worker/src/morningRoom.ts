import type { Env, StateSnapshot } from "./types"
import { stripPrivate } from "./db/snapshot"

const EMPTY_SNAPSHOT: StateSnapshot = {
    version: 0,
    session: { id: "", openAt: 0, closeAt: 0, requestCap: 2, requestOpen: true, autoplay: true, serverTime: 0 },
    nowPlaying: null,
    queue: [], played: []
}

const HEARTBEAT_MS = 15000
interface Client {
    controller: ReadableStreamDefaultController<Uint8Array>
    connId: string
    isAdmin: boolean
}

const jsonRes = (data: unknown): Response =>
    new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })

export class MorningRoom {
    private state: DurableObjectState
    private clients = new Map<string, Client>()
    private encoder = new TextEncoder()

    constructor(state: DurableObjectState, _env: Env) {
        this.state = state
    }

    // routes
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url)
        const { method } = request

        if (url.pathname === "/events" && method === "GET") return this.handleSSE(url)
        if (url.pathname === "/state" && method === "GET") return jsonRes(await this.getSnapshot())
        if (url.pathname === "/sync" && method === "POST") {
            await this.applySnapshot((await request.json()) as StateSnapshot)
            return jsonRes({ ok: true })
        }
        return new Response("not found", { status: 404 })
    }

    // sse
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
                this.safeEnqueue(client, "state", client.isAdmin ? snapshot : stripPrivate(snapshot))

                heartbeat = setInterval(() => {
                    try { controller.enqueue(this.encoder.encode(": ping\n\n")) }
                    catch { this.dropClient(client.connId, heartbeat) }
                }, HEARTBEAT_MS)
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

    // snapshot
    private async getSnapshot(): Promise<StateSnapshot> {
        return (await this.state.storage.get<StateSnapshot>("snapshot")) ?? EMPTY_SNAPSHOT
    }

    // store + push
    private async applySnapshot(snapshot: StateSnapshot): Promise<void> {
        await this.state.storage.put("snapshot", snapshot)
        const publicSnapshot = stripPrivate(snapshot)
        for (const client of this.clients.values()) {
            this.safeEnqueue(client, "state", client.isAdmin ? snapshot : publicSnapshot)
        }
    }
}
