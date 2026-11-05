export const parseCookie = (header: string | null): Record<string, string> => {
    const out: Record<string, string> = {}
    if (!header) return out
    for (const part of header.split(";")) {
        const idx = part.indexOf("=")
        if (idx === -1) continue
        try { out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim()) }
        catch { /* bad escape */ }
    }
    return out
}

interface CookieOpts {
    maxAgeSeconds?: number
    clear?: boolean
    dev?: boolean
}

export const serializeCookie = (name: string, value: string, opts: CookieOpts = {}): string => {
    const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly"]
    parts.push(...(opts.dev ? ["SameSite=Lax"] : ["Secure", "SameSite=None"]))
    if (opts.clear) parts.push("Max-Age=0")
    else if (opts.maxAgeSeconds) parts.push(`Max-Age=${opts.maxAgeSeconds}`)
    return parts.join("; ")
}
