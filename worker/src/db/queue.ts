import type { ClearScope, SongRequest } from "../types"
import { rowToRequest } from "./mappers"
import { ensureSession } from "./sessions"

//reads
const list = async (db: D1Database, sql: string, ...args: unknown[]): Promise<SongRequest[]> => {
    const { results } = await db.prepare(sql).bind(...args).all()
    return (results ?? []).map(rowToRequest)
}

export const getQueue = (db: D1Database, sessionId: string): Promise<SongRequest[]> =>
    list(db, `SELECT * FROM requests WHERE session_id = ? AND status = 'queued' ORDER BY position ASC`, sessionId)

export const getPlayed = (db: D1Database, sessionId: string, limit = 30): Promise<SongRequest[]> =>
    list(db, `SELECT * FROM requests WHERE session_id = ? AND status = 'played' ORDER BY played_at DESC LIMIT ?`, sessionId, limit)

export const listMine = (db: D1Database, sessionId: string, deviceId: string): Promise<SongRequest[]> =>
    list(db, `SELECT * FROM requests WHERE session_id = ? AND device_id = ? ORDER BY created_at ASC`, sessionId, deviceId)

export const getPlaying = async (db: D1Database, sessionId: string): Promise<SongRequest | null> =>
    (await list(db, `SELECT * FROM requests WHERE session_id = ? AND status = 'playing' ORDER BY updated_at DESC LIMIT 1`, sessionId))[0] ?? null

export const nextPosition = async (db: D1Database, sessionId: string): Promise<number> => {
    const row = await db
        .prepare(`SELECT MAX(position) as m FROM requests WHERE session_id = ? AND status = 'queued'`)
        .bind(sessionId)
        .first<{ m: number | null }>()
    return (row?.m ?? 0) + 1
}

// order
export const reorderQueue = async (db: D1Database, sessionId: string, orderedIds: string[]): Promise<void> => {
    const now = Date.now()
    const stmts = orderedIds.map((id, idx) => db
        .prepare(`UPDATE requests SET position = ?, updated_at = ? WHERE id = ? AND session_id = ? AND status = 'queued'`)
        .bind(idx + 1, now, id, sessionId))
    if (stmts.length) await db.batch(stmts)
}

export const requeueRequest = async (db: D1Database, sessionId: string, id: string, toFront = false): Promise<void> => {
    const restIds = (await getQueue(db, sessionId)).map((r) => r.id).filter((x) => x !== id)

    await db
        .prepare(`UPDATE requests SET status = 'queued', skip_reason = NULL, updated_at = ? WHERE id = ? AND session_id = ?`)
        .bind(Date.now(), id, sessionId)
        .run()

    await reorderQueue(db, sessionId, toFront ? [id, ...restIds] : [...restIds, id])
}

// playback
export const setPlayingExclusive = async (db: D1Database, sessionId: string, id: string): Promise<void> => {
    const current = await getPlaying(db, sessionId)
    if (current && current.id !== id) await requeueRequest(db, sessionId, current.id, false)

    await db
        .prepare(`UPDATE requests SET status = 'playing', position = NULL, skip_reason = NULL, updated_at = ? WHERE id = ? AND session_id = ?`)
        .bind(Date.now(), id, sessionId)
        .run()
}

// idle/autoplay
export const maybeAutoAdvance = async (db: D1Database, sessionId: string): Promise<boolean> => {
    if (!(await ensureSession(db, sessionId)).autoplay) return false
    if (await getPlaying(db, sessionId)) return false

    const [next] = await getQueue(db, sessionId)
    if (!next) return false

    await db
        .prepare(`UPDATE requests SET status = 'playing', position = NULL, updated_at = ? WHERE id = ?`)
        .bind(Date.now(), next.id)
        .run()
    return true
}

// cls
export const clearQueue = async (db: D1Database, sessionId: string, scope: ClearScope, deviceId?: string | null): Promise<void> => {
    const del = (status: string) => db.prepare(`DELETE FROM requests WHERE session_id = ? AND status = ?`).bind(sessionId, status).run()

    if (scope === "played" || scope === "both") await del("played")
    if (scope === "queued" || scope === "both") await del("queued")
    if (scope !== "user_quota") return

    // quota reset
    if (deviceId) await db
        .prepare(`UPDATE requests SET quota_exempt = 1, updated_at = ? WHERE session_id = ? AND device_id = ?`)
        .bind(Date.now(), sessionId, deviceId)
        .run()
    else await db
        .prepare(`UPDATE requests SET quota_exempt = 1, updated_at = ? WHERE session_id = ?`)
        .bind(Date.now(), sessionId)
        .run()
}
