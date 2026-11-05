import type { Env } from "../types"
export const isDev = (env: Env): boolean => env.DEV === "1"
const LOCAL_HOST_RE = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/

const isLocalOrigin = (origin: string): boolean => {
    try { return LOCAL_HOST_RE.test(new URL(origin).hostname) }
    catch { return false }
}

const listOrigins = (env: Env): string[] =>(env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean)

export const allowedOrigin = (req: Request, env: Env): string | undefined => {
    const origin = req.headers.get("Origin")
    if (!origin) return undefined
    if (listOrigins(env).includes(origin)) return origin
    if (isDev(env) && isLocalOrigin(origin)) return origin
    return undefined
}

export const CORS = (h: Headers, origin?: string): void => {
    if (origin) {
        h.set("Access-Control-Allow-Origin", origin)
        h.set("Access-Control-Allow-Credentials", "true")
    }
    h.set("Access-Control-Allow-Headers", "Content-Type")
    h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    h.set("Access-Control-Max-Age", "600")
    h.set("Vary", "Origin")
}
