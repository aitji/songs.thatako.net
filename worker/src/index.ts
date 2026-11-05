import type { Env } from "./types"
import { isAdmin } from "./auth"
import { CORS } from "./http/cors"
import { makeCtx } from "./http/ctx"
import { dispatch } from "./http/router"
import { publicRoutes } from "./routes/public"
import { adminAuthRoutes, adminRoutes } from "./routes/admin"
export { MorningRoom } from "./morningRoom"

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const c = makeCtx(req, env)

        // preflight
        if (req.method === "OPTIONS") {
            const headers = new Headers()
            CORS(headers, c.origin)
            return new Response(null, { status: 204, headers })
        }

        try {
            // public & login/logout/me
            const open = await dispatch([...publicRoutes, ...adminAuthRoutes], c)
            if (open) return open

            // pr only
            if (c.url.pathname.startsWith("/api/admin/")) {
                if (!(await isAdmin(req, env))) return c.fail("unauthorized", 401)
                const res = await dispatch(adminRoutes, c)
                if (res) return res
            }

            return c.fail("not_found", 404)
        } catch (err) {
            console.error(err)
            return c.fail("internal_error", 500)
        }
    },
}
