import type { Env } from "./types"
import { adminToken, parseCookie, serializeCookie, verifyAdminToken } from "./utils"

const COOKIE_NAME = "pr_session"
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours
const LOGIN_WINDOW_MS = 10 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 8

export const isAdmin = async (request: Request, env: Env): Promise<boolean> => {
    const cookies = parseCookie(request.headers.get("Cookie"))
    const token = cookies[COOKIE_NAME]
    if (!token) return false
    return verifyAdminToken(token, env.SESSION_SECRET)
}

export const loginCookie = async (env: Env): Promise<string> => {
    const t = await adminToken(env.SESSION_SECRET, TOKEN_TTL_MS)
    return serializeCookie(COOKIE_NAME, t, { maxAgeSeconds: TOKEN_TTL_MS / 1000 })
}

export const logoutSC = (): string => serializeCookie(COOKIE_NAME, "", { clear: true })
export const isRateLimit = async (db: D1Database, ip: string): Promise<boolean> => {
    const row = await db.prepare("SELECT * FROM login_attempts WHERE ip = ?").bind(ip).first<any>()
    if (!row) return true
    if (Date.now() - row.window_start > LOGIN_WINDOW_MS) return true
    return row.count < LOGIN_MAX_ATTEMPTS
}

export const saveLoginDB = async (db: D1Database, ip: string, success: boolean): Promise<void> => {
    const now = Date.now()
    if (success) {
        await db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run()
        return
    }

    const row = await db.prepare("SELECT * FROM login_attempts WHERE ip = ?").bind(ip).first<any>()
    if (!row || now - row.window_start > LOGIN_WINDOW_MS) await db
        .prepare(`INSERT INTO login_attempts (ip, count, window_start) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET count = 1, window_start = excluded.window_start`)
        .bind(ip, now)
        .run()
    else await db.prepare("UPDATE login_attempts SET count = count + 1 WHERE ip = ?").bind(ip).run()
}

export const isPass = (inp: string, exp: string): boolean => {
    if (inp.length !== exp.length) return false
    let result = 0
    for (let i = 0; i < inp.length; i++) result |= inp.charCodeAt(i) ^ exp.charCodeAt(i)
    return result === 0
}
