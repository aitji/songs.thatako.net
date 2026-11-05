import type { Env } from "./types"
import { COOKIE_NAME, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, TOKEN_TTL_MS } from "./config"
import { adminToken, verifyAdminToken } from "./lib/token"
import { parseCookie, serializeCookie } from "./lib/cookie"

// session cookie
export const isAdmin = async (req: Request, env: Env): Promise<boolean> => {
    const token = parseCookie(req.headers.get("Cookie"))[COOKIE_NAME]
    return !!token && verifyAdminToken(token, env.SESSION_SECRET)
}

export const loginCookie = async (env: Env, dev: boolean): Promise<string> => serializeCookie(COOKIE_NAME, await adminToken(env.SESSION_SECRET, TOKEN_TTL_MS), { maxAgeSeconds: TOKEN_TTL_MS / 1000, dev })
export const logoutCookie = (dev: boolean): string => serializeCookie(COOKIE_NAME, "", { clear: true, dev })

// brute-force limit
export const canLogin = async (db: D1Database, ip: string): Promise<boolean> => {
    const row = await db.prepare("SELECT * FROM login_attempts WHERE ip = ?").bind(ip).first<any>()
    if (!row || Date.now() - row.window_start > LOGIN_WINDOW_MS) return true
    return row.count < LOGIN_MAX_ATTEMPTS
}

export const recordLogin = async (db: D1Database, ip: string, success: boolean): Promise<void> => {
    if (success) {
        await db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run()
        return
    }

    const now = Date.now()
    const row = await db.prepare("SELECT * FROM login_attempts WHERE ip = ?").bind(ip).first<any>()
    if (!row || now - row.window_start > LOGIN_WINDOW_MS) await db
        .prepare(`INSERT INTO login_attempts (ip, count, window_start) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET count = 1, window_start = excluded.window_start`)
        .bind(ip, now)
        .run()
    else await db.prepare("UPDATE login_attempts SET count = count + 1 WHERE ip = ?").bind(ip).run()
}

// constant-time compare
export const isPass = (input: unknown, expected: string): boolean => {
    if (typeof input !== "string" || input.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
    return diff === 0
}
