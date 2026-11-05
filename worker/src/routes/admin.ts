import type { Ctx } from "../http/ctx"
import type { Handler, Route } from "../http/router"
import type { ClearScope, SessionPatch } from "../types"
import { route } from "../http/router"
import { canLogin, isAdmin, isPass, loginCookie, logoutCookie, recordLogin } from "../auth"
import { captchaError, checkTurnstile } from "../turnstile"
import { bumpAndSync } from "../sync"
import { DAY_MS, DEVICE_MAX, MAX_CAP, NICK_MAX, REASON_MAX, REORDER_MAX } from "../config"
import { isEpoch, isNum, isStr } from "../lib/guards"
import { cleanText } from "../lib/text"
import { parseYTID, ytMeta } from "../lib/youtube"
import {
    clearQueue, deleteRequest, ensureSession, findActiveDuplicate, getRequest,
    insertRequest, listMine, reorderQueue, requeueRequest, resetSession, reviewRequest,
    setPlayingExclusive, setStatus, toPublic, updateSession,
} from "../db"

const CLEAR_SCOPES: ClearScope[] = ["played", "queued", "both", "user_quota"]

// helpers
const synced = async (c: Ctx, extra: object = {}): Promise<Response> => {
    await bumpAndSync(c.env, c.sessionId)
    return c.json({ ok: true, ...extra })
}

// req today
const today = async (c: Ctx, id: string) => {
    const r = await getRequest(c.env.DB, id)
    return r && r.sessionId === c.sessionId ? r : null
}

// auth
const login: Handler = async (c) => {
    if (!(await canLogin(c.env.DB, c.ip))) return c.fail("too_many_attempts", 429)

    const b = await c.body()
    const capErr = captchaError(await checkTurnstile(c.env, b.turnstileToken, c.ip, "login"))
    if (capErr) return c.fail(capErr, 403)

    const password = isStr(b.password) ? b.password.slice(0, 256) : ""
    const ok = password.length > 0 && isPass(password, c.env.ADMIN_PASSWORD)
    await recordLogin(c.env.DB, c.ip, ok)
    if (!ok) return c.fail("invalid_password", 401)

    const headers = new Headers()
    headers.append("Set-Cookie", await loginCookie(c.env, c.dev))
    return c.json({ ok: true }, { headers })
}

const me: Handler = async (c) => c.json({ authed: await isAdmin(c.req, c.env) })
const logout: Handler = (c) => {
    const headers = new Headers()
    headers.append("Set-Cookie", logoutCookie(c.dev))
    return c.json({ ok: true }, { headers })
}

// settings
const settings: Handler = async (c) => {
    const b = await c.body()
    const patch: SessionPatch = {}

    if (isNum(b.requestCap)) patch.requestCap = Math.max(0, Math.min(MAX_CAP, Math.floor(b.requestCap)))
    if (typeof b.requestOpen === "boolean") patch.requestOpen = b.requestOpen
    if (typeof b.autoplay === "boolean") patch.autoplay = b.autoplay
    if (isEpoch(b.openAt)) patch.openAt = b.openAt
    if (isEpoch(b.closeAt)) patch.closeAt = b.closeAt

    if (patch.openAt !== undefined || patch.closeAt !== undefined) {
        const cur = await ensureSession(c.env.DB, c.sessionId)
        const open = patch.openAt ?? cur.openAt
        const close = patch.closeAt ?? cur.closeAt
        if (close <= open) patch.closeAt = close + DAY_MS
    }

    await updateSession(c.env.DB, c.sessionId, patch)
    return synced(c)
}

const settingsReset: Handler = async (c) => {
    const next = await resetSession(c.env.DB, c.sessionId)
    return synced(c, { session: next })
}

// queue
const queueAdd: Handler = async (c) => {
    const b = await c.body()
    const ytID = parseYTID(b.youtubeUrl)
    if (!ytID) return c.fail("invalid_youtube_url")
    await ensureSession(c.env.DB, c.sessionId)
    if (await findActiveDuplicate(c.env.DB, c.sessionId, ytID)) return c.fail("duplicate_song", 409)

    const meta = await ytMeta(ytID)
    const created = await insertRequest(c.env.DB, {
        sessionId: c.sessionId, deviceId: "admin", youtubeId: ytID,
        title: meta.title, channel: meta.channel,
        nickname: cleanText(b.nickname, NICK_MAX),
        source: "admin",
    })
    await bumpAndSync(c.env, c.sessionId)
    return c.json({ request: toPublic(created) }, { status: 201 })
}

const queueReorder: Handler = async (c) => {
    const { orderedIds } = await c.body()
    const valid = Array.isArray(orderedIds)
        && orderedIds.length > 0 && orderedIds.length <= REORDER_MAX
        && orderedIds.every((x) => isStr(x) && x.length > 0 && x.length <= DEVICE_MAX)
    if (!valid) return c.fail("ordered_ids_required")

    await reorderQueue(c.env.DB, c.sessionId, orderedIds)
    return synced(c)
}

const queueAction: Handler = async (c, [id, action]) => {
    if (!(await today(c, id))) return c.fail("not_found", 404)
    const { DB } = c.env

    if (action === "skip") await setStatus(DB, id, "skipped", { skipReason: cleanText((await c.body()).reason, REASON_MAX) })
    else if (action === "delete") await deleteRequest(DB, c.sessionId, id)
    else if (action === "play") await setPlayingExclusive(DB, c.sessionId, id)
    else if (action === "played") await setStatus(DB, id, "played")
    else if (action === "requeue") await requeueRequest(DB, c.sessionId, id, false)
    return synced(c)
}

const queueReview: Handler = async (c, [id]) => {
    if (!(await today(c, id))) return c.fail("not_found", 404)
    const { reviewed } = await c.body()
    await reviewRequest(c.env.DB, id, typeof reviewed === "boolean" ? reviewed : true)
    return synced(c)
}

const queueClear: Handler = async (c) => {
    const b = await c.body()
    if (!CLEAR_SCOPES.includes(b.scope)) return c.fail("invalid_scope")
    const deviceId = isStr(b.deviceId) && b.deviceId ? b.deviceId.slice(0, DEVICE_MAX) : undefined

    await clearQueue(c.env.DB, c.sessionId, b.scope, deviceId)
    return synced(c)
}

// device
const deviceRequests: Handler = async (c, [raw]) => {
    let deviceId: string
    try { deviceId = decodeURIComponent(raw).slice(0, DEVICE_MAX) }
    catch { return c.fail("invalid_device_id") }

    const rows = await listMine(c.env.DB, c.sessionId, deviceId)
    return c.json({ requests: rows.map((r) => toPublic(r, undefined, true)) })
}

// tables
export const adminAuthRoutes: Route[] = [
    route("POST", "/api/admin/login", login),
    route("GET", "/api/admin/me", me),
    route("POST", "/api/admin/logout", logout),
]

// gated by index
export const adminRoutes: Route[] = [
    route("POST", "/api/admin/settings", settings),
    route("POST", "/api/admin/settings/reset", settingsReset),
    route("POST", "/api/admin/queue/add", queueAdd),
    route("POST", "/api/admin/queue/reorder", queueReorder),
    route("POST", "/api/admin/queue/clear", queueClear),
    route("POST", /^\/api\/admin\/queue\/([^/]+)\/(skip|play|played|delete|requeue)$/, queueAction),
    route("POST", /^\/api\/admin\/queue\/([^/]+)\/review$/, queueReview),
    route("GET", /^\/api\/admin\/device\/([^/]+)\/requests$/, deviceRequests),
]
