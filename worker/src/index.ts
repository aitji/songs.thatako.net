import type { ClearScope, Env, StateSnapshot } from "./types"
import {
    isRateLimit, isPass,
    isAdmin, loginCookie,
    logoutSC, saveLoginDB
} from "./auth"
import {
    CORS, thDateStr,
    ResError, ytMeta,
    jsonRes, parseYTID,
    stripDeviceIds,
} from "./utils"
import {
    buildSnapshot, clearQueue, countActiveRequests,
    findActiveDuplicate as findDupe, ensureSession,
    getRequest, insertRequest as insertReq,
    listMine, maybeAutoAdvance, reorderQueue,
    requeueRequest, resetSession, setPlayingExclusive, setStatus,
    toPublic, updateSession
} from "./db"
export { MorningRoom } from "./morningRoom"

const getRoomStub = (env: Env, sessionId: string) => {
    const id = env.MORNING_ROOM.idFromName(sessionId)
    return env.MORNING_ROOM.get(id)
}

const ensureSnapshot = async (env: Env, sessionId: string): Promise<StateSnapshot> => {
    const stub = getRoomStub(env, sessionId)
    const current = (await (await stub.fetch("https://do/state")).json()) as StateSnapshot
    if (current.session.id === sessionId) return current

    const fresh = await buildSnapshot(env.DB, sessionId, (current.version ?? 0) + 1)
    await stub.fetch("https://do/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fresh),
    })
    return fresh
}

const bumpAndSync = async (env: Env, sessionId: string): Promise<StateSnapshot> => {
    const stub = getRoomStub(env, sessionId)
    const current = (await (await stub.fetch("https://do/state")).json()) as StateSnapshot
    const nextVer = (current.version ?? 0) + 1

    await maybeAutoAdvance(env.DB, sessionId)
    const snapshot = await buildSnapshot(env.DB, sessionId, nextVer)

    await stub.fetch("https://do/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot)
    })
    return snapshot
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url)
        const origin = env.ALLOWED_ORIGIN

        if (request.method === "OPTIONS") {
            const headers = new Headers()
            CORS(headers, origin)
            return new Response(null, { headers })
        }

        const id = thDateStr()
        try {
            // public
            if (url.pathname === "/api/health") return jsonRes({ ok: true, time: Date.now() }, {}, origin)
            if (url.pathname === "/api/requests" && request.method === "POST") return handleCReq(request, env, origin)
            if (url.pathname === "/api/state" && request.method === "GET") {
                await ensureSession(env.DB, id)
                const snap = await ensureSnapshot(env, id)
                const admin = await isAdmin(request, env)
                return jsonRes(admin ? snap : stripDeviceIds(snap), {}, origin)
            }
            if (url.pathname === "/api/events" && request.method === "GET") {
                await ensureSession(env.DB, id)
                await ensureSnapshot(env, id)

                const stub = getRoomStub(env, id)
                const deviceId = url.searchParams.get("deviceId")
                const admin = await isAdmin(request, env)
                const doUrl = new URL("https://do/events")
                if (deviceId) doUrl.searchParams.set("deviceId", deviceId.slice(0, 64))
                if (admin) doUrl.searchParams.set("admin", "1")

                const doResponse = await stub.fetch(doUrl.toString())
                const headers = new Headers(doResponse.headers)

                CORS(headers, origin)
                return new Response(doResponse.body, { status: doResponse.status, headers })
            }

            if (url.pathname === "/api/requests/mine" && request.method === "GET") {
                const deviceId = url.searchParams.get("deviceId")
                if (!deviceId) return ResError("device_id_required", 400, origin)
                const [mine, session, quotaUsed] = await Promise.all([
                    listMine(env.DB, id, deviceId),
                    ensureSession(env.DB, id),
                    countActiveRequests(env.DB, id, deviceId),
                ])
                return jsonRes({
                    requests: mine.map((r) => toPublic(r, deviceId)),
                    quotaUsed,
                    quotaCap: session.requestCap,
                }, {}, origin)
            }

            // pr team
            if (url.pathname === "/api/admin/login" && request.method === "POST") return adminLogon(request, env, origin)
            if (url.pathname === "/api/admin/me" && request.method === "GET") return jsonRes({ authed: await isAdmin(request, env) }, {}, origin)
            if (url.pathname === "/api/admin/logout" && request.method === "POST") {
                const h = new Headers()
                CORS(h, origin)
                h.append("Set-Cookie", logoutSC())
                return jsonRes({ ok: true }, { headers: h }, origin)
            }
            if (url.pathname.startsWith("/api/admin/")) {
                if (!(await isAdmin(request, env))) return ResError("unauthorized", 401, origin)
                return adminApi(request, env, url, origin)
            }

            return ResError("not_found", 404, origin)
        } catch (err) {
            console.error(err)
            return ResError("internal_error", 500, origin)
        }
    },

}

const handleCReq = async (request: Request, env: Env, origin?: string): Promise<Response> => {
    const body = (await request.json().catch(() => null)) as any
    if (!body || typeof body.deviceId !== "string" || typeof body.youtubeUrl !== "string") return ResError("device_id_and_youtube_url_required", 400, origin)
    const deviceId = body.deviceId.slice(0, 64)
    const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 24) || null : null

    const ytID = parseYTID(body.youtubeUrl)
    if (!ytID) return ResError("invalid_youtube_url", 400, origin)

    const id = thDateStr()
    const session = await ensureSession(env.DB, id)
    const now = Date.now()

    if (!session.requestOpen) return ResError("requests_closed", 403, origin)
    if (now < session.openAt) return ResError("requests_not_open_yet", 403, origin)
    if (now > session.closeAt) return ResError("requests_closed", 403, origin)

    if (await findDupe(env.DB, id, ytID)) return ResError("duplicate_song", 409, origin)

    const count = await countActiveRequests(env.DB, id, deviceId)
    if (count >= session.requestCap) return ResError("cap_reached", 403, origin)

    const meta = await ytMeta(ytID)
    const created = await insertReq(env.DB, {
        sessionId: id,
        deviceId,
        youtubeId: ytID,
        title: meta.title,
        channel: meta.channel,
        nickname,
        source: "student",
    })

    await bumpAndSync(env, id)
    return jsonRes({ request: toPublic(created, deviceId) }, { status: 201 }, origin)
}

const adminLogon = async (request: Request, env: Env, origin?: string): Promise<Response> => {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown"
    if (!(await isRateLimit(env.DB, ip))) return ResError("too_many_attempts", 429, origin)

    const body = (await request.json().catch(() => null)) as any
    const password = typeof body?.password === "string" ? body.password : ""
    const ok = password.length > 0 && isPass(password, env.ADMIN_PASSWORD)
    await saveLoginDB(env.DB, ip, ok)
    if (!ok) return ResError("invalid_password", 401, origin)

    const headers = new Headers()
    CORS(headers, origin)
    headers.append("Set-Cookie", await loginCookie(env))
    return jsonRes({ ok: true }, { headers }, origin)
}

const adminApi = async (request: Request, env: Env, url: URL, origin?: string): Promise<Response> => {
    const sessionId = thDateStr()
    const path = url.pathname

    if (path === "/api/admin/settings" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as any
        const patch: Record<string, unknown> = {}
        if (typeof body.requestCap === "number") patch.requestCap = Math.max(0, Math.min(20, Math.floor(body.requestCap)))
        if (typeof body.requestOpen === "boolean") patch.requestOpen = body.requestOpen
        if (typeof body.autoplay === "boolean") patch.autoplay = body.autoplay
        if (typeof body.openAt === "number") patch.openAt = body.openAt
        if (typeof body.closeAt === "number") patch.closeAt = body.closeAt
        if (typeof patch.openAt === "number" || typeof patch.closeAt === "number") {
            const current = await ensureSession(env.DB, sessionId)
            const effectiveOpen = typeof patch.openAt === "number" ? patch.openAt : current.openAt
            const effectiveClose = typeof patch.closeAt === "number" ? patch.closeAt : current.closeAt
            if (effectiveClose <= effectiveOpen) patch.closeAt = effectiveClose + 24 * 60 * 60 * 1000
        }

        await updateSession(env.DB, sessionId, patch as any)
        await bumpAndSync(env, sessionId)
        return jsonRes({ ok: true }, {}, origin)
    }

    if (path === "/api/admin/settings/reset" && request.method === "POST") {
        const next = await resetSession(env.DB, sessionId)
        await bumpAndSync(env, sessionId)
        return jsonRes({ ok: true, session: next }, {}, origin)
    }

    if (path === "/api/admin/queue/add" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as any
        const ytID = parseYTID(body?.youtubeUrl ?? "")
        if (!ytID) return ResError("invalid_youtube_url", 400, origin)
        const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 24) || null : null
        if (await findDupe(env.DB, sessionId, ytID)) return ResError("duplicate_song", 409, origin)

        const meta = await ytMeta(ytID)
        const created = await insertReq(env.DB, {
            sessionId,
            deviceId: "admin",
            youtubeId: ytID,
            title: meta.title,
            channel: meta.channel,
            nickname,
            source: "admin",
        })
        await bumpAndSync(env, sessionId)
        return jsonRes({ request: toPublic(created) }, { status: 201 }, origin)
    }

    if (path === "/api/admin/queue/reorder" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as any
        const orderedIds = Array.isArray(body?.orderedIds)
            ? body.orderedIds.filter((x: unknown): x is string => typeof x === "string")
            : null
        if (!orderedIds) return ResError("ordered_ids_required", 400, origin)
        await reorderQueue(env.DB, sessionId, orderedIds)
        await bumpAndSync(env, sessionId)
        return jsonRes({ ok: true }, {}, origin)
    }

    const actionMatch = path.match(/^\/api\/admin\/queue\/([^/]+)\/(skip|play|played|delete|requeue)$/)
    if (actionMatch && request.method === "POST") {
        const [, id, action] = actionMatch
        const existing = await getRequest(env.DB, id)
        if (!existing || existing.sessionId !== sessionId) return ResError("not_found", 404, origin)

        if (action === "skip" || action === "delete") {
            const body = (await request.json().catch(() => ({}))) as any
            const reason = action === "skip" && typeof body?.reason === "string" ? body.reason.trim().slice(0, 80) || null : null
            await setStatus(env.DB, id, "skipped", { skipReason: reason })
        }
        else if (action === "play") await setPlayingExclusive(env.DB, sessionId, id)
        else if (action === "played") await setStatus(env.DB, id, "played")
        else if (action === "requeue") await requeueRequest(env.DB, sessionId, id, false)
        await bumpAndSync(env, sessionId)
        return jsonRes({ ok: true }, {}, origin)
    }

    if (path === "/api/admin/queue/clear" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as any
        const scope = body?.scope as ClearScope
        if (!["played", "queued", "both", "user_quota"].includes(scope)) return ResError("invalid_scope", 400, origin)
        const deviceId = typeof body?.deviceId === "string" ? body.deviceId.slice(0, 64) : undefined
        await clearQueue(env.DB, sessionId, scope, deviceId)
        await bumpAndSync(env, sessionId)
        return jsonRes({ ok: true }, {}, origin)
    }

    const deviceMatch = path.match(/^\/api\/admin\/device\/([^/]+)\/requests$/)
    if (deviceMatch && request.method === "GET") {
        const deviceId = decodeURIComponent(deviceMatch[1]).slice(0, 64)
        const rows = await listMine(env.DB, sessionId, deviceId)
        return jsonRes({ requests: rows.map((r) => toPublic(r)) }, {}, origin)
    }

    return ResError("not_found", 404, origin)
}
