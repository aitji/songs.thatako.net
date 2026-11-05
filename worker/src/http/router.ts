import type { Ctx } from "./ctx"
export type Handler = (c: Ctx, m: string[]) => Response | Promise<Response>
export interface Route {
    method: string
    path: string | RegExp
    run: Handler
}

export const route = (method: string, path: string | RegExp, run: Handler): Route => ({ method, path, run })
export const dispatch = async (routes: Route[], c: Ctx): Promise<Response | null> => {
    const { pathname } = c.url
    for (const r of routes) {
        if (r.method !== "*" && r.method !== c.req.method) continue
        if (typeof r.path === "string") {
            if (r.path === pathname) return r.run(c, [])
            continue
        }
        const m = pathname.match(r.path)
        if (m) return r.run(c, m.slice(1))
    }
    return null
}
