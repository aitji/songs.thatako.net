import type { Handler, Route } from "../http/router"
import { route } from "../http/router"
import { CORS } from "../http/cors"
import { isAdmin } from "../auth"
import { captchaError, checkTurnstile } from "../turnstile"
import { bumpAndSync, ensureSnapshot, roomOf } from "../sync"
import { NICK_MAX, NOTE_MAX } from "../config"
import { cleanDevice, cleanText } from "../lib/text"
import { parseYTID, ytMeta } from "../lib/youtube"
import {
    countActiveRequests, ensureSession, findActiveDuplicate, getRequest,
    insertRequest, listMine, removeOwnQueued, stripPrivate, toPublic, updateOwnText,
} from "../db"

// read
const health: Handler = (c) => c.json({ ok: true, time: Date.now() })
const state: Handler = async (c) => {
    await ensureSession(c.env.DB, c.sessionId)
    const snap = await ensureSnapshot(c.env, c.sessionId)
    return c.json((await isAdmin(c.req, c.env)) ? snap : stripPrivate(snap))
}

// sse proxy
const events: Handler = async (c) => {
    await ensureSession(c.env.DB, c.sessionId)
    await ensureSnapshot(c.env, c.sessionId)

    const doUrl = new URL("https://do/events")
    if (await isAdmin(c.req, c.env)) {
        doUrl.searchParams.set("admin", "1")
        const cid = cleanDevice(c.url.searchParams.get("cid"))
        if (cid) doUrl.searchParams.set("cid", cid)
    }

    const res = await roomOf(c.env, c.sessionId).fetch(doUrl.toString())
    const headers = new Headers(res.headers)
    CORS(headers, c.origin)
    return new Response(res.body, { status: res.status, headers })
}

const mine: Handler = async (c) => {
    const deviceId = cleanDevice(c.url.searchParams.get("deviceId"))
    if (!deviceId) return c.fail("device_id_required")
    const rows = await listMine(c.env.DB, c.sessionId, deviceId)
    return c.json({ requests: rows.map((r) => toPublic(r, deviceId)) })
}

// write
const createRequest: Handler = async (c) => {
    const { env, sessionId } = c
    const b = await c.body()

    // shape
    const deviceId = cleanDevice(b.deviceId)
    if (!deviceId || typeof b.youtubeUrl !== "string") return c.fail("device_id_and_youtube_url_required")
    const ytID = parseYTID(b.youtubeUrl)
    if (!ytID) return c.fail("invalid_youtube_url")

    // captcha
    const capErr = captchaError(await checkTurnstile(env, b.turnstileToken, c.ip, "request"))
    if (capErr) return c.fail(capErr, 403)

    // session window
    const session = await ensureSession(env.DB, sessionId)
    const now = Date.now()
    if (!session.requestOpen || now > session.closeAt) return c.fail("requests_closed", 403)
    if (now < session.openAt) return c.fail("requests_not_open_yet", 403)

    // dupe / quota
    if (await findActiveDuplicate(env.DB, sessionId, ytID)) return c.fail("duplicate_song", 409)
    if ((await countActiveRequests(env.DB, sessionId, deviceId)) >= session.requestCap) return c.fail("cap_reached", 403)

    const meta = await ytMeta(ytID)
    const created = await insertRequest(env.DB, {
        sessionId, deviceId, youtubeId: ytID,
        title: meta.title, channel: meta.channel,
        nickname: cleanText(b.nickname, NICK_MAX),
        note: cleanText(b.note, NOTE_MAX),
        source: "student",
    })

    await bumpAndSync(env, sessionId)
    return c.json({ request: toPublic(created, deviceId) }, { status: 201 })
}

// selfedit
const ownRequest: Handler = async (c, [reqId, action]) => {
    const { env, sessionId } = c
    const b = await c.body()
    const deviceId = cleanDevice(b.deviceId)
    if (!deviceId) return c.fail("device_id_required")

    const existing = await getRequest(env.DB, reqId)
    if (!existing || existing.sessionId !== sessionId || existing.deviceId !== deviceId || existing.source !== "student") {
        return c.fail("not_found", 404)
    }

    if (action === "remove") {
        if (!(await removeOwnQueued(env.DB, reqId, deviceId))) return c.fail("not_removable", 409)
        await bumpAndSync(env, sessionId)
        return c.json({ ok: true })
    }

    const patch: { nickname?: string | null; note?: string | null } = {}
    if ("nickname" in b) patch.nickname = cleanText(b.nickname, NICK_MAX)
    if ("note" in b) patch.note = cleanText(b.note, NOTE_MAX)
    if (!Object.keys(patch).length) return c.fail("nothing_to_update")
    if (!(await updateOwnText(env.DB, reqId, deviceId, patch))) return c.fail("not_editable", 409)

    await bumpAndSync(env, sessionId)
    const updated = await getRequest(env.DB, reqId)
    return c.json({ ok: true, request: updated ? toPublic(updated, deviceId) : null })
}

// table
export const publicRoutes: Route[] = [
    route("*", "/api/health", health),
    route("GET", "/api/state", state),
    route("GET", "/api/events", events),
    route("GET", "/api/requests/mine", mine),
    route("POST", "/api/requests", createRequest),
    route("POST", /^\/api\/requests\/([^/]+)\/(update|remove)$/, ownRequest),
]
