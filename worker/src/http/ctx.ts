import type { Env } from "../types"
import { thDateStr } from "../lib/time"
import { CORS, allowedOrigin, isDev } from "./cors"

export interface Ctx {
    req: Request
    env: Env
    url: URL
    origin?: string
    dev: boolean
    sessionId: string
    ip: string
    json: (data: unknown, init?: ResponseInit) => Response
    fail: (code: string, status?: number) => Response
    body: () => Promise<Record<string, any>>
}

export const makeCtx = (req: Request, env: Env): Ctx => {
    const origin = allowedOrigin(req, env)

    const json: Ctx["json"] = (data, init = {}) => {
        const h = new Headers(init.headers)
        h.set("Content-Type", "application/json; charset=utf-8")
        CORS(h, origin)
        return new Response(JSON.stringify(data), { ...init, headers: h })
    }

    return {
        req, env, origin,
        url: new URL(req.url),
        dev: isDev(env),
        sessionId: thDateStr(),
        ip: req.headers.get("CF-Connecting-IP") || "unknown",
        json,
        fail: (code, status = 400) => json({ error: code }, { status }),
        body: async () => {
            const b = await req.json().catch(() => null)
            return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, any>) : {}
        },
    }
}
