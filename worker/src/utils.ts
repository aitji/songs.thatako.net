import type { PublicRequest, StateSnapshot } from "./types"

const stripReqDeviceId = (r: PublicRequest): PublicRequest => {
    if (!("deviceId" in r)) return r
    const { deviceId, ...rest } = r
    return rest
}

export const stripDeviceIds = (snap: StateSnapshot): StateSnapshot => ({
    ...snap,
    nowPlaying: snap.nowPlaying ? stripReqDeviceId(snap.nowPlaying) : null,
    queue: snap.queue.map(stripReqDeviceId),
    played: snap.played.map(stripReqDeviceId),
})

export const jsonRes = (
    data: unknown,
    init: ResponseInit = {},
    og?: string
): Response => {
    const h = new Headers(init.headers)
    h.set("Content-Type", "application/json; charset=utf-8")
    CORS(h, og)
    return new Response(JSON.stringify(data), { ...init, headers: h })
}

export const CORS = (h: Headers, og?: string): void => {
    if (og) {
        h.set("Access-Control-Allow-Origin", og)
        h.set("Access-Control-Allow-Credentials", "true")
    }
    h.set("Access-Control-Allow-Headers", "Content-Type")
    h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    h.set("Vary", "Origin")
}

export const ResError = (code: string, status = 400, origin?: string): Response => jsonRes({ error: code }, { status }, origin)
export const newId = (prefix = "id"): string => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`
export const thDateStr = (date: Date = new Date()): string => { // yyyy-mm-dd
    const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    })
    return fmt.format(date)
}

export const thDate = (hhmm: string, base: Date = new Date()): number => {
    const dateStr = thDateStr(base)
    const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10))
    const iso = `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`
    return new Date(iso).getTime()
}

const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/
export const parseYTID = (input: unknown): string | null => {
    if (typeof input !== "string" || !input || input.length > 2048) return null
    const trimmed = input.trim()
    if (YT_ID_REGEX.test(trimmed)) return trimmed
    try {
        const url = new URL(trimmed)
        const host = url.hostname.replace(/^www\./, "")
        if (host === "youtu.be") {
            const id = url.pathname.slice(1).split("/")[0]
            return YT_ID_REGEX.test(id) ? id : null
        }
        if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
            if (url.pathname === "/watch") {
                const id = url.searchParams.get("v")
                return id && YT_ID_REGEX.test(id) ? id : null
            }
            const shorts = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
            if (shorts) return shorts[1]
            const embed = url.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/)
            if (embed) return embed[1]
            const live = url.pathname.match(/^\/live\/([a-zA-Z0-9_-]{11})/)
            if (live) return live[1]
        }
        return null
    } catch { return null }
}

export const ytMeta = async (videoId: string): Promise<{ title: string | null; channel: string | null }> => {
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
        const res = await fetch(oembedUrl)
        if (!res.ok) return { title: null, channel: null }
        const data = (await res.json()) as { title?: string; author_name?: string }
        return { title: data.title ?? null, channel: data.author_name ?? null }
    } catch { return { title: null, channel: null } }
}

// pr team, stuff
const hmacKey = async (secret: string): Promise<CryptoKey> => {
    const enc = new TextEncoder()
    return crypto.subtle.importKey(
        "raw", enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false, ["sign", "verify"]
    )
}

const b2aUrl = (bytes: ArrayBufferLike): string => {
    let bin = ""
    new Uint8Array(bytes).forEach((b) => (bin += String.fromCharCode(b)))
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const a2bUrl = (str: string): Uint8Array => {
    const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4))
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad
    const bin = atob(b64)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export const adminToken = async (secret: string, ttlMs: number): Promise<string> => {
    const payload = JSON.stringify({ exp: Date.now() + ttlMs })
    const b64 = b2aUrl(new TextEncoder().encode(payload).buffer)

    const key = await hmacKey(secret)
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(b64))
    return `${b64}.${b2aUrl(sig)}`
}

export const verifyAdminToken = async (token: string, secret: string): Promise<boolean> => {
    const [b64, sigB64] = token.split(".")
    if (!b64 || !sigB64) return false
    const key = await hmacKey(secret)
    const valid = await crypto.subtle.verify(
        "HMAC", key,
        a2bUrl(sigB64), new TextEncoder().encode(b64)
    )

    if (!valid) return false
    try {
        const payload = JSON.parse(new TextDecoder().decode(a2bUrl(b64)))
        return typeof payload.exp === "number" && payload.exp > Date.now()
    } catch { return false }
}

// cookies!
export const parseCookie = (header: string | null): Record<string, string> => {
    const out: Record<string, string> = {}
    if (!header) return out
    for (const part of header.split(";")) {
        const idx = part.indexOf("=")
        if (idx === -1) continue
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
    }
    return out
}

export const serializeCookie = (
    name: string,
    value: string,
    opts: { maxAgeSeconds?: number; clear?: boolean } = {}
): string => {
    const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "Secure", "SameSite=None"]
    if (opts.clear) parts.push("Max-Age=0")
    else if (opts.maxAgeSeconds) parts.push(`Max-Age=${opts.maxAgeSeconds}`)
    return parts.join("; ")
}
