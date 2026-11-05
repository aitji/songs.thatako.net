export const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/
export const watchUrl = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
export const ytThumbnail = (id) => (typeof id === "string" && YT_ID_RE.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "")

const YT_HOSTS = ["youtube.com", "m.youtube.com", "music.youtube.com"]
const bad = (reason) => ({ kind: "error", reason })

export const parseYouTube = (raw) => {
    let s = String(raw || "").trim()
    if (!s) return { kind: "empty" }
    if (YT_ID_RE.test(s)) return { kind: "ok", id: s, url: s }

    const found = s.match(/https?:\/\/\S+/i)
    if (found) s = found[0]
    else if (/\s/.test(s)) return bad("ลิงก์ต้องไม่มีช่องว่าง ลองวางลิงก์จากปุ่มแชร์ของยูทูบ")

    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
        if (/^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)(\/|$)/i.test(s)) s = "https://" + s
        else return bad("วางลิงก์ยูทูบ เช่น https://youtu.be/...")
    }

    let u
    try { u = new URL(s) } catch { return bad("ลิงก์ยังไม่สมบูรณ์") }
    const host = u.hostname.replace(/^www\./, "")
    const ok = (id) => (YT_ID_RE.test(id || "") ? { kind: "ok", id, url: s } : null)

    if (host === "youtu.be") return ok(u.pathname.slice(1).split("/")[0]) || bad("ลิงก์ youtu.be ยังไม่ครบ ลองคัดลอกใหม่อีกครั้ง")
    if (!YT_HOSTS.includes(host)) return bad("ต้องเป็นลิงก์จากยูทูบเท่านั้น")

    if (u.pathname === "/watch") return ok(u.searchParams.get("v")) || bad("ลิงก์นี้ไม่มีรหัสวิดีโอ ลองคัดลอกใหม่อีกครั้ง")
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/)
    if (m) return { kind: "ok", id: m[1], url: s }
    if (u.pathname === "/playlist") return bad("นี่เป็นลิงก์เพลย์ลิสต์ เปิดเพลงที่ต้องการแล้วคัดลอกลิงก์ของเพลงนั้น")
    if (/^\/(@|channel\/|c\/|user\/)/.test(u.pathname)) return bad("นี่เป็นลิงก์ช่อง ต้องเป็นลิงก์ของวิดีโอ")
    return bad("ลิงก์นี้ไม่ใช่วิดีโอ ลองคัดลอกจากปุ่มแชร์ของเพลง")
}
