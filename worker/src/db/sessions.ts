import type { SessionPatch, SessionSettings } from "../types"
import { DEFAULT_AUTOPLAY, DEFAULT_CAP, DEFAULT_CLOSE, DEFAULT_OPEN } from "../config"
import { thDate, thDateStr } from "../lib/time"
import { rowToSession } from "./mappers"

export const ensureSession = async (db: D1Database, sessionId?: string): Promise<SessionSettings> => {
    const id = sessionId ?? thDateStr()
    const found = await db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first<any>()
    if (found) return rowToSession(found)

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

export const updateSession = async (db: D1Database, sessionId: string, patch: SessionPatch): Promise<SessionSettings> => {
    const next = { ...(await ensureSession(db, sessionId)), ...patch }
    await db
        .prepare(`UPDATE sessions SET open_at = ?, close_at = ?, request_cap = ?, request_open = ?, autoplay = ? WHERE id = ?`)
        .bind(next.openAt, next.closeAt, next.requestCap, next.requestOpen ? 1 : 0, next.autoplay ? 1 : 0, sessionId)
        .run()
    return next
}

export const resetSession = (db: D1Database, sessionId: string): Promise<SessionSettings> => updateSession(db, sessionId, {
    openAt: thDate(DEFAULT_OPEN),
    closeAt: thDate(DEFAULT_CLOSE),
    requestCap: DEFAULT_CAP,
    requestOpen: true,
    autoplay: DEFAULT_AUTOPLAY,
})
