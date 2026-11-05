import type { RequestSource, RequestStatus, SongRequest } from "../types"
import { newId } from "../lib/text"
import { rowToRequest } from "./mappers"
import { nextPosition } from "./queue"

export interface NewRequest {
    sessionId: string
    deviceId: string
    youtubeId: string
    title: string | null
    channel: string | null
    nickname: string | null
    note?: string | null
    source: RequestSource
}

const changed = (res: D1Result): boolean => (res.meta?.changes ?? 0) > 0

// check
export const countActiveRequests = async (db: D1Database, sessionId: string, deviceId: string): Promise<number> => {
    const row = await db
        .prepare(`SELECT COUNT(*) as c FROM requests WHERE session_id = ? AND device_id = ? AND status IN ('queued','playing','played') AND quota_exempt = 0`)
        .bind(sessionId, deviceId)
        .first<{ c: number }>()
    return row?.c ?? 0
}

export const findActiveDuplicate = async (db: D1Database, sessionId: string, youtubeId: string): Promise<boolean> =>
    !!(await db
        .prepare(`SELECT id FROM requests WHERE session_id = ? AND youtube_id = ? AND status IN ('queued','playing','played') LIMIT 1`)
        .bind(sessionId, youtubeId)
        .first())

// create / read
export const insertRequest = async (db: D1Database, p: NewRequest): Promise<SongRequest> => {
    const id = newId("req")
    const now = Date.now()
    const position = await nextPosition(db, p.sessionId)
    const note = p.note ?? null

    await db
        .prepare(`INSERT INTO requests (id, session_id, device_id, youtube_id, title, channel, nickname, note, status, source, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`)
        .bind(id, p.sessionId, p.deviceId, p.youtubeId, p.title, p.channel, p.nickname, note, p.source, position, now, now)
        .run()

    return {
        id, sessionId: p.sessionId, deviceId: p.deviceId, youtubeId: p.youtubeId,
        title: p.title, channel: p.channel, nickname: p.nickname, note,
        status: "queued", source: p.source, position,
        skipReason: null, quotaExempt: false, reviewed: false,
        createdAt: now, updatedAt: now, playedAt: null, skippedAt: null,
    }
}

export const getRequest = async (db: D1Database, id: string): Promise<SongRequest | null> => {
    const row = await db.prepare("SELECT * FROM requests WHERE id = ?").bind(id).first<any>()
    return row ? rowToRequest(row) : null
}

// status
export const setStatus = async (db: D1Database, id: string, status: RequestStatus, extra: { skipReason?: string | null } = {}): Promise<void> => {
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

export const reviewRequest = async (db: D1Database, id: string, reviewed: boolean): Promise<void> => {
    await db.prepare(`UPDATE requests SET reviewed = ?, updated_at = ? WHERE id = ?`).bind(reviewed ? 1 : 0, Date.now(), id).run()
}

// self-edit
export const updateOwnText = async (
    db: D1Database, id: string, deviceId: string,
    patch: { nickname?: string | null; note?: string | null }
): Promise<boolean> => {
    const sets: string[] = []
    const vals: unknown[] = []
    if ("nickname" in patch) { sets.push("nickname = ?"); vals.push(patch.nickname ?? null) }
    if ("note" in patch) { sets.push("note = ?"); vals.push(patch.note ?? null) }
    if (!sets.length) return false

    sets.push("updated_at = ?")
    vals.push(Date.now())
    const res = await db
        .prepare(`UPDATE requests SET ${sets.join(", ")} WHERE id = ? AND device_id = ? AND source = 'student' AND status IN ('queued','playing')`)
        .bind(...vals, id, deviceId)
        .run()
    return changed(res)
}

export const removeOwnQueued = async (db: D1Database, id: string, deviceId: string): Promise<boolean> =>
    changed(await db
        .prepare(`DELETE FROM requests WHERE id = ? AND device_id = ? AND source = 'student' AND status = 'queued'`)
        .bind(id, deviceId)
        .run())

export const deleteRequest = async (db: D1Database, sessionId: string, id: string): Promise<void> => {
    await db.prepare(`DELETE FROM requests WHERE id = ? AND session_id = ?`).bind(id, sessionId).run()
}
