import type { Env, PlaybackState, PlayerActionKind, PlayerCmdType, PlayerStatus, StateSnapshot } from "./types"
import { stripPrivate } from "./db/snapshot"
import { PLAYER_ONLINE_MS } from "./config"

const EMPTY_SNAPSHOT: StateSnapshot = {
    version: 0,
    session: { id: "", openAt: 0, closeAt: 0, requestCap: 2, requestOpen: true, autoplay: true, serverTime: 0 },
    nowPlaying: null,
    queue: [], played: []
}

const EMPTY_PLAYBACK: PlaybackState = {
    rev: 0,
    playerId: null, playerLabel: null, online: false, lastSeen: 0,
    requestId: null, status: "idle", positionMs: 0, durationMs: 0, updatedAt: 0,
    volume: 100, muted: false, needsGesture: false,
    lastAction: null, serverTime: 0,
}

const HEARTBEAT_MS = 15000
interface Client {
    controller: ReadableStreamDefaultController<Uint8Array>
    connId: string
    isAdmin: boolean
    clientId: string | null
}

interface ClaimBody { clientId: string; label: string; force: boolean }
interface ReleaseBody { clientId: string }
interface ReportBody {
    clientId: string; requestId: string | null; status: PlayerStatus
    positionMs: number; durationMs: number; volume: number; muted: boolean
    needsGesture: boolean; local: PlayerCmdType | null
}
interface CmdBody { type: PlayerCmdType; value?: number | boolean; by: string; byId: string }

const jsonRes = (data: unknown, status = 200): Response =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

export class MorningRoom {
    private state: DurableObjectState
    private clients = new Map<string, Client>()
    private encoder = new TextEncoder()
    private pb: PlaybackState = { ...EMPTY_PLAYBACK }
    private cmdSeq = 0

    constructor(state: DurableObjectState, _env: Env) {
        this.state = state
        state.blockConcurrencyWhile(async () => {
            const saved = await state.storage.get<PlaybackState>("playback")
            if (saved) this.pb = { ...EMPTY_PLAYBACK, ...saved }
        })
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

        if (method === "POST" && url.pathname.startsWith("/player/")) {
            const body = await request.json()
            if (url.pathname === "/player/claim") return this.claim(body as ClaimBody)
            if (url.pathname === "/player/release") return this.release(body as ReleaseBody)
            if (url.pathname === "/player/report") return this.report(body as ReportBody)
            if (url.pathname === "/player/cmd") return this.cmd(body as CmdBody)
        }
        return new Response("not found", { status: 404 })
    }

    // sse
    private handleSSE(url: URL): Response {
        const client: Client = {
            controller: null as unknown as ReadableStreamDefaultController<Uint8Array>,
            connId: crypto.randomUUID(),
            isAdmin: url.searchParams.get("admin") === "1",
            clientId: url.searchParams.get("cid"),
        }

        let heartbeat: ReturnType<typeof setInterval> | null = null
        const stream = new ReadableStream<Uint8Array>({
            start: async (controller) => {
                client.controller = controller
                this.clients.set(client.connId, client)

                const snapshot = await this.getSnapshot()
                this.safeEnqueue(client, "state", client.isAdmin ? snapshot : stripPrivate(snapshot))

                if (client.isAdmin) {
                    if (client.clientId && client.clientId === this.pb.playerId) this.broadcastPlayback()
                    else this.safeEnqueue(client, "player", this.viewPlayback())
                }

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
        const client = this.clients.get(connId)
        this.clients.delete(connId)
        if (client?.clientId && client.clientId === this.pb.playerId && !this.hasConn(client.clientId)) this.broadcastPlayback()
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

        const nowId = snapshot.nowPlaying?.id ?? null
        if (nowId !== this.pb.requestId) {
            Object.assign(this.pb, {
                requestId: nowId,
                status: nowId ? "loading" : "idle",
                positionMs: 0, durationMs: 0, updatedAt: Date.now(), needsGesture: false,
            })
            await this.commitPlayback()
        }
    }

    // player
    private hasConn(clientId: string): boolean {
        for (const c of this.clients.values()) if (c.clientId === clientId) return true
        return false
    }

    private isOnline(now = Date.now()): boolean {
        const { playerId, lastSeen } = this.pb
        return !!playerId && this.hasConn(playerId) && now - lastSeen < PLAYER_ONLINE_MS
    }

    private viewPlayback(): PlaybackState {
        const now = Date.now()
        return { ...this.pb, online: this.isOnline(now), serverTime: now }
    }

    private broadcastPlayback(): void {
        const view = this.viewPlayback()
        for (const client of this.clients.values()) if (client.isAdmin) this.safeEnqueue(client, "player", view)
    }

    private async commitPlayback(): Promise<void> {
        this.pb.rev++
        await this.state.storage.put("playback", this.pb)
        this.broadcastPlayback()
    }

    private setAction(what: PlayerActionKind, by: string, byId: string, local: boolean): void {
        this.pb.lastAction = { what, by, byId, local, at: Date.now() }
    }

    private async claim(b: ClaimBody): Promise<Response> {
        const taken = !!this.pb.playerId && this.pb.playerId !== b.clientId && this.isOnline()
        if (taken && !b.force) return jsonRes({ ok: false, error: "player_taken", playerLabel: this.pb.playerLabel }, 409)

        Object.assign(this.pb, { playerId: b.clientId, playerLabel: b.label, lastSeen: Date.now(), needsGesture: false })
        this.setAction("claim", b.label, b.clientId, false)
        await this.commitPlayback()
        return jsonRes({ ok: true, playback: this.viewPlayback() })
    }

    private async release(b: ReleaseBody): Promise<Response> {
        if (this.pb.playerId !== b.clientId) return jsonRes({ ok: true })
        const label = this.pb.playerLabel ?? ""
        Object.assign(this.pb, {
            playerId: null, playerLabel: null, needsGesture: false,
            status: this.pb.status === "playing" || this.pb.status === "buffering" ? "paused" : this.pb.status,
        })
        this.setAction("release", label, b.clientId, true)
        await this.commitPlayback()
        return jsonRes({ ok: true })
    }

    private async report(b: ReportBody): Promise<Response> {
        if (this.pb.playerId !== b.clientId) return jsonRes({ ok: false, error: "not_player" }, 409)

        const now = Date.now()
        this.pb.lastSeen = now
        this.pb.volume = b.volume
        this.pb.muted = b.muted

        if (b.requestId && b.requestId === this.pb.requestId) {
            Object.assign(this.pb, {
                status: b.status, positionMs: b.positionMs, durationMs: b.durationMs,
                updatedAt: now, needsGesture: b.needsGesture,
            })
        }

        if (b.local) this.setAction(b.local, this.pb.playerLabel ?? "", b.clientId, true)

        await this.commitPlayback()
        return jsonRes({ ok: true })
    }

    private async cmd(b: CmdBody): Promise<Response> {
        const speakerId = this.pb.playerId
        if (!speakerId || !this.isOnline()) return jsonRes({ ok: false, error: "no_player" }, 409)

        const msg = { id: ++this.cmdSeq, type: b.type, value: b.value, by: b.by, at: Date.now() }
        for (const client of this.clients.values()) if (client.clientId === speakerId) this.safeEnqueue(client, "cmd", msg)

        this.setAction(b.type, b.by, b.byId, false)
        await this.commitPlayback()
        return jsonRes({ ok: true, delivered: true })
    }
}
