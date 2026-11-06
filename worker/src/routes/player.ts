import type { Ctx } from "../http/ctx"
import type { Handler, Route } from "../http/router"
import type { PlayerCmdType, PlayerStatus } from "../types"
import { route } from "../http/router"
import { bumpAndSync, roomOf } from "../sync"
import { CLIENT_LABEL_MAX, MAX_SEEK_MS, REASON_MAX } from "../config"
import { isNum, isStr } from "../lib/guards"
import { cleanDevice, cleanText } from "../lib/text"
import { getRequest, playNext, playPrevious, setStatus } from "../db"

const STATUSES: PlayerStatus[] = ["idle", "loading", "playing", "paused", "buffering"]
const CMDS: PlayerCmdType[] = ["play", "pause", "seek", "volume", "mute"]

const ERR_REASON: Record<number, string> = {
    2: "ลิงก์วิดีโอไม่ถูกต้อง",
    100: "ไม่พบวิดีโอ (ถูกลบหรือตั้งเป็นส่วนตัว)",
    101: "เจ้าของวิดีโอไม่อนุญาตให้เปิดนอก YouTube",
    150: "เจ้าของวิดีโอไม่อนุญาตให้เปิดนอก YouTube",
}

const num = (v: unknown, min: number, max: number): number | null => (isNum(v) ? Math.max(min, Math.min(max, v)) : null)
const label = (v: unknown): string => cleanText(v, CLIENT_LABEL_MAX) ?? "ไม่ทราบอุปกรณ์"

// forward
const toRoom = async (c: Ctx, path: string, body: object): Promise<Response> => {
    const res = await roomOf(c.env, c.sessionId).fetch(`https://do${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({ ok: false }))
    return c.json(data, { status: res.status })
}

const claim: Handler = async (c) => {
    const b = await c.body()
    const clientId = cleanDevice(b.clientId)
    if (!clientId) return c.fail("client_id_required")
    return toRoom(c, "/player/claim", { clientId, label: label(b.label), force: b.force === true })
}

const release: Handler = async (c) => {
    const clientId = cleanDevice((await c.body()).clientId)
    if (!clientId) return c.fail("client_id_required")
    return toRoom(c, "/player/release", { clientId })
}

const report: Handler = async (c) => {
    const b = await c.body()
    const clientId = cleanDevice(b.clientId)
    if (!clientId) return c.fail("client_id_required")
    if (!STATUSES.includes(b.status)) return c.fail("invalid_status")

    return toRoom(c, "/player/report", {
        clientId,
        requestId: isStr(b.requestId) && b.requestId ? b.requestId.slice(0, 64) : null,
        status: b.status,
        positionMs: num(b.positionMs, 0, MAX_SEEK_MS) ?? 0,
        durationMs: num(b.durationMs, 0, MAX_SEEK_MS) ?? 0,
        volume: Math.round(num(b.volume, 0, 100) ?? 100),
        muted: b.muted === true,
        needsGesture: b.needsGesture === true,
        local: CMDS.includes(b.local) ? b.local : null,
    })
}

const cmd: Handler = async (c) => {
    const b = await c.body()
    const clientId = cleanDevice(b.clientId)
    if (!clientId) return c.fail("client_id_required")
    if (!CMDS.includes(b.type)) return c.fail("invalid_command")

    let value: number | boolean | undefined
    if (b.type === "seek") {
        const ms = num(b.value, 0, MAX_SEEK_MS)
        if (ms === null) return c.fail("invalid_value")
        value = Math.round(ms)
    } else if (b.type === "volume") {
        const v = num(b.value, 0, 100)
        if (v === null) return c.fail("invalid_value")
        value = Math.round(v)
    } else if (b.type === "mute") value = b.value === true

    return toRoom(c, "/player/cmd", { type: b.type, value, by: label(b.by), byId: clientId })
}

const ended: Handler = async (c) => {
    const id = (await c.body()).requestId
    const r = isStr(id) ? await getRequest(c.env.DB, id) : null
    if (!r || r.sessionId !== c.sessionId || r.status !== "playing") return c.json({ ok: true, ignored: true })

    await setStatus(c.env.DB, r.id, "played")
    await bumpAndSync(c.env, c.sessionId)
    return c.json({ ok: true })
}

const failed: Handler = async (c) => {
    const b = await c.body()
    const r = isStr(b.requestId) ? await getRequest(c.env.DB, b.requestId) : null
    if (!r || r.sessionId !== c.sessionId || r.status !== "playing") return c.json({ ok: true, ignored: true })

    const reason = (isNum(b.code) && ERR_REASON[b.code]) || "เปิดเพลงนี้ไม่ได้"
    await setStatus(c.env.DB, r.id, "skipped", { skipReason: reason.slice(0, REASON_MAX) })
    await bumpAndSync(c.env, c.sessionId)
    return c.json({ ok: true, reason })
}

const next: Handler = async (c) => {
    await playNext(c.env.DB, c.sessionId)
    await bumpAndSync(c.env, c.sessionId)
    return c.json({ ok: true })
}

const prev: Handler = async (c) => {
    if (!(await playPrevious(c.env.DB, c.sessionId))) return c.fail("no_previous", 404)
    await bumpAndSync(c.env, c.sessionId)
    return c.json({ ok: true })
}

// gated by index
export const playerRoutes: Route[] = [
    route("POST", "/api/admin/player/claim", claim),
    route("POST", "/api/admin/player/release", release),
    route("POST", "/api/admin/player/report", report),
    route("POST", "/api/admin/player/cmd", cmd),
    route("POST", "/api/admin/player/ended", ended),
    route("POST", "/api/admin/player/failed", failed),
    route("POST", "/api/admin/player/next", next),
    route("POST", "/api/admin/player/prev", prev),
]
