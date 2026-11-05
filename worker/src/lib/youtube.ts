import { URL_MAX } from "../config"

const ID_RE = /^[a-zA-Z0-9_-]{11}$/
const PATH_ID_RE = /^\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/
const YT_HOSTS = ["youtube.com", "m.youtube.com", "music.youtube.com"]

const okId = (id: string | null | undefined): string | null => (id && ID_RE.test(id) ? id : null)

// url / bare id -> video id
export const parseYTID = (input: unknown): string | null => {
    if (typeof input !== "string" || !input || input.length > URL_MAX) return null
    const s = input.trim()
    if (ID_RE.test(s)) return s
    try {
        const url = new URL(s)
        const host = url.hostname.replace(/^www\./, "")
        if (host === "youtu.be") return okId(url.pathname.slice(1).split("/")[0])
        if (!YT_HOSTS.includes(host)) return null
        if (url.pathname === "/watch") return okId(url.searchParams.get("v"))
        return okId(url.pathname.match(PATH_ID_RE)?.[1])
    } catch { return null }
}

// oembed / null on fail
export const ytMeta = async (videoId: string): Promise<{ title: string | null; channel: string | null }> => {
    const none = { title: null, channel: null }
    try {
        const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)
        const res = await fetch(`https://www.youtube.com/oembed?url=${watch}&format=json`)
        if (!res.ok) return none
        const data = (await res.json()) as { title?: string; author_name?: string }
        return { title: data.title ?? null, channel: data.author_name ?? null }
    } catch { return none }
}
