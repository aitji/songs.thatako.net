import type { ClearScope, PublicRequest, RequestStatus, SessionSettings, SongRequest, StateSnapshot } from "./types"
import { thDateStr, thDate, newId } from "./utils"

export const DEFAULT_OPEN = "06:30"
export const DEFAULT_CLOSE = "07:45"
export const DEFAULT_CAP = 2
export const DEFAULT_AUTOPLAY = true

const rowToSession = (row: any): SessionSettings => {
    return {
        id: row.id,
        openAt: row.open_at,
        closeAt: row.close_at,
        requestCap: row.request_cap,
        requestOpen: !!row.request_open,
        autoplay: !!row.autoplay,
        createdAt: row.created_at,
    }
}

const rowToRequest = (row: any): SongRequest => {
    return {
        id: row.id,
        sessionId: row.session_id,
        deviceId: row.device_id,
        youtubeId: row.youtube_id,
        title: row.title,
        channel: row.channel,
        nickname: row.nickname,
        status: row.status,
        source: row.source,
        position: row.position,
        skipReason: row.skip_reason,
        quotaExempt: !!row.quota_exempt,
        reviewed: !!row.reviewed,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        playedAt: row.played_at,
        skippedAt: row.skipped_at,
    }
}

export const ensureSession = async (db: D1Database, sessionId?: string): Promise<SessionSettings> => {
    const id = sessionId ?? thDateStr()
    const e = await db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first<any>()
    if (e) return rowToSession(e)

    const prev = await db.prepare("SELECT * FROM sessions ORDER BY id DESC LIMIT 1").first<any>()
    const cap = prev?.request_cap ?? DEFAULT_CAP
    const openAt = thDate(DEFAULT_OPEN)
    const closeAt = thDate(DEFAULT_CLOSE)
    const now = Date.now()

    await db
        .prepare(`INSERT INTO sessions (id, open_at, close_at, request_cap, request_open, autoplay, created_at) VALUES (?, ?, ?, ?, 1, 1, ?)`)
        .bind(id, openAt, closeAt, cap, now)
        .run()

    return { id, openAt, closeAt, requestCap: cap, requestOpen: true, autoplay: DEFAULT_AUTOPLAY, createdAt: now }
}

export const updateSession = async (
    db: D1Database,
    sessionId: string,
    patch: Partial<Pick<SessionSettings, "openAt" | "closeAt" | "requestCap" | "requestOpen" | "autoplay">>
): Promise<SessionSettings> => {
    const current = await ensureSession(db, sessionId)
    const next = { ...current, ...patch }
    await db
        .prepare(`UPDATE sessions SET open_at = ?, close_at = ?, request_cap = ?, request_open = ?, autoplay = ? WHERE id = ?`)
        .bind(next.openAt, next.closeAt, next.requestCap, next.requestOpen ? 1 : 0, next.autoplay ? 1 : 0, sessionId)
        .run()
    return next
}

export const resetSession = async (db: D1Database, sessionId: string): Promise<SessionSettings> => updateSession(db, sessionId, {
    openAt: thDate(DEFAULT_OPEN),
    closeAt: thDate(DEFAULT_CLOSE),
    requestCap: DEFAULT_CAP,
    requestOpen: true,
    autoplay: DEFAULT_AUTOPLAY,
})

export const countActiveRequests = async (db: D1Database, sessionId: string, deviceId: string): Promise<number> => {
    const row = await db
        .prepare(`SELECT COUNT(*) as c FROM requests WHERE session_id = ? AND device_id = ? AND status IN ('queued','playing','played') AND quota_exempt = 0`)
        .bind(sessionId, deviceId)
        .first<{ c: number }>()
    return row?.c ?? 0
}

export const findActiveDuplicate = async (db: D1Database, sessionId: string, youtubeId: string): Promise<boolean> => {
    const row = await db
        .prepare(`SELECT id FROM requests WHERE session_id = ? AND youtube_id = ? AND status IN ('queued','playing','played') LIMIT 1`)
        .bind(sessionId, youtubeId)
        .first()
    return !!row
}

const nextPosition = async (db: D1Database, sessionId: string): Promise<number> => {
    const row = await db
        .prepare(`SELECT MAX(position) as m FROM requests WHERE session_id = ? AND status = 'queued'`)
        .bind(sessionId)
        .first<{ m: number | null }>()
    return (row?.m ?? 0) + 1
}

export const insertRequest = async (
    db: D1Database,
    params: {
        sessionId: string
        deviceId: string
        youtubeId: string
        title: string | null
        channel: string | null
        nickname: string | null
        source: "student" | "admin"
    }
): Promise<SongRequest> => {
    const id = newId("req")
    const now = Date.now()
    const position = await nextPosition(db, params.sessionId)
    await db
        .prepare(`INSERT INTO requests (id, session_id, device_id, youtube_id, title, channel, nickname, status, source, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`)
        .bind(
            id,
            params.sessionId,
            params.deviceId,
            params.youtubeId,
            params.title,
            params.channel,
            params.nickname,
            params.source,
            position,
            now,
            now
        )
        .run()

    return {
        id,
        sessionId: params.sessionId,
        deviceId: params.deviceId,
        youtubeId: params.youtubeId,
        title: params.title,
        channel: params.channel,
        nickname: params.nickname,
        status: "queued",
        source: params.source,
        position,
        skipReason: null,
        quotaExempt: false,
        reviewed: false,
        createdAt: now,
        updatedAt: now,
        playedAt: null,
        skippedAt: null,
    }
}

export const getRequest = async (db: D1Database, id: string): Promise<SongRequest | null> => {
    const row = await db.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first<any>()
    return row ? rowToRequest(row) : null
}

export const setStatus = async (
    db: D1Database,
    id: string,
    status: RequestStatus,
    extra: { skipReason?: string | null } = {}
): Promise<void> => {
    const now = Date.now()
    if (status === "skipped") await db
        .prepare(`UPDATE requests SET status = ?, skip_reason = ?, skipped_at = ?, updated_at = ?, position = NULL WHERE id = ?`)
        .bind(status, extra.skipReason ?? null, now, now, id)
        .run()
    else if (status === "played") await db
        .prepare(`UPDATE requests SET status = ?, played_at = ?, updated_at = ?, position = NULL WHERE id = ?`)
        .bind(status, now, now, id)
        .run()
    else await db
        .prepare(`UPDATE requests SET status = ?, updated_at = ? WHERE id = ?`)
        .bind(status, now, id)
        .run()
}

export const reorderQueue = async (db: D1Database, sessionId: string, orderedIds: string[]): Promise<void> => {
    const now = Date.now()
    const stmts = orderedIds.map((id, idx) => db
        .prepare(`UPDATE requests SET position = ?, updated_at = ? WHERE id = ? AND session_id = ? AND status = 'queued'`)
        .bind(idx + 1, now, id, sessionId)
    )
    if (stmts.length) await db.batch(stmts)
}

export const requeueRequest = async (
    db: D1Database,
    sessionId: string,
    id: string,
    toFront = false
): Promise<void> => {
    const now = Date.now()
    const restIds = (await getQueue(db, sessionId)).map((r) => r.id).filter((x) => x !== id)

    await db
        .prepare(`UPDATE requests SET status = 'queued', skip_reason = NULL, updated_at = ? WHERE id = ? AND session_id = ?`)
        .bind(now, id, sessionId)
        .run()

    const orderedIds = toFront ? [id, ...restIds] : [...restIds, id]
    await reorderQueue(db, sessionId, orderedIds)
}

export const setPlayingExclusive = async (db: D1Database, sessionId: string, id: string): Promise<void> => {
    const now = Date.now()
    const current = await getPlaying(db, sessionId)
    if (current && current.id !== id) await requeueRequest(db, sessionId, current.id, false)

    await db
        .prepare(`UPDATE requests SET status = 'playing', position = NULL, skip_reason = NULL, updated_at = ? WHERE id = ? AND session_id = ?`)
        .bind(now, id, sessionId)
        .run()
}

export const maybeAutoAdvance = async (db: D1Database, sessionId: string): Promise<boolean> => {
    const session = await ensureSession(db, sessionId)
    if (!session.autoplay) return false

    const playing = await getPlaying(db, sessionId)
    if (playing) return false

    const [next] = await getQueue(db, sessionId)
    if (!next) return false

    await db
        .prepare(`UPDATE requests SET status = 'playing', position = NULL, updated_at = ? WHERE id = ?`)
        .bind(Date.now(), next.id)
        .run()
    return true
}

export const reviewRequest = async (db: D1Database, id: string, reviewed: boolean): Promise<void> => {
    await db
        .prepare(`UPDATE requests SET reviewed = ?, updated_at = ? WHERE id = ?`)
        .bind(reviewed ? 1 : 0, Date.now(), id)
        .run()
}

export const clearQueue = async (
    db: D1Database,
    sessionId: string,
    scope: ClearScope,
    deviceId?: string | null
): Promise<void> => {
    if (scope === "played" || scope === "both") {
        await db.prepare(`DELETE FROM requests WHERE session_id = ? AND status = 'played'`).bind(sessionId).run()
    }
    if (scope === "queued" || scope === "both") {
        await db.prepare(`DELETE FROM requests WHERE session_id = ? AND status = 'queued'`).bind(sessionId).run()
    }
    if (scope === "user_quota") {
        if (deviceId) await db
            .prepare(`UPDATE requests SET quota_exempt = 1, updated_at = ? WHERE session_id = ? AND device_id = ?`)
            .bind(Date.now(), sessionId, deviceId)
            .run()
        else await db
            .prepare(`UPDATE requests SET quota_exempt = 1, updated_at = ? WHERE session_id = ?`)
            .bind(Date.now(), sessionId)
            .run()
    }
}

export const getQueue = async (db: D1Database, sessionId: string): Promise<SongRequest[]> => {
    const { results } = await db
        .prepare(`SELECT * FROM requests WHERE session_id = ? AND status = 'queued' ORDER BY position ASC`)
        .bind(sessionId)
        .all()
    return (results ?? []).map(rowToRequest)
}

export const getPlayed = async (db: D1Database, sessionId: string, limit = 30): Promise<SongRequest[]> => {
    const { results } = await db
        .prepare(`SELECT * FROM requests WHERE session_id = ? AND status = 'played' ORDER BY played_at DESC LIMIT ?`)
        .bind(sessionId, limit)
        .all()
    return (results ?? []).map(rowToRequest)
}

export const getPlaying = async (db: D1Database, sessionId: string): Promise<SongRequest | null> => {
    const row = await db
        .prepare(`SELECT * FROM requests WHERE session_id = ? AND status = 'playing' ORDER BY updated_at DESC LIMIT 1`)
        .bind(sessionId)
        .first<any>()
    return row ? rowToRequest(row) : null
}

export const listMine = async (db: D1Database, sessionId: string, deviceId: string): Promise<SongRequest[]> => {
    const { results } = await db
        .prepare(`SELECT * FROM requests WHERE session_id = ? AND device_id = ? ORDER BY created_at ASC`)
        .bind(sessionId, deviceId)
        .all()
    return (results ?? []).map(rowToRequest)
}

export const toPublic = (r: SongRequest, deviceId?: string, includeDeviceId = false): PublicRequest => {
    return {
        id: r.id,
        youtubeId: r.youtubeId,
        title: r.title,
        channel: r.channel,
        nickname: r.nickname,
        status: r.status,
        source: r.source,
        skipReason: r.skipReason,
        reviewed: r.reviewed,
        createdAt: r.createdAt,
        ...(deviceId ? { mine: r.deviceId === deviceId } : {}),
        ...(includeDeviceId ? { deviceId: r.deviceId } : {}),
    }
}

export const buildSnapshot = async (db: D1Database, sessionId: string, version: number): Promise<StateSnapshot> => {
    const session = await ensureSession(db, sessionId)
    const [queue, played, nowPlaying] = await Promise.all([
        getQueue(db, sessionId),
        getPlayed(db, sessionId),
        getPlaying(db, sessionId),
    ])
    return {
        version,
        session: {
            id: session.id,
            openAt: session.openAt,
            closeAt: session.closeAt,
            requestCap: session.requestCap,
            requestOpen: session.requestOpen,
            autoplay: session.autoplay,
            serverTime: Date.now(),
        },
        nowPlaying: nowPlaying ? toPublic(nowPlaying, undefined, true) : null,
        queue: queue.map((r) => toPublic(r, undefined, true)),
        played: played.map((r) => toPublic(r, undefined, true)),
    }
}
