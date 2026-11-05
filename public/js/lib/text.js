import { esc } from "./dom.js"

export const UNNAMED = "ไม่ระบุชื่อ"
export const STATUS_LABEL = { queued: "รอคิว", playing: "กำลังเปิด", played: "เปิดแล้ว", skipped: "ถูกข้าม" }

export const whoOf = (r) => r.nickname || UNNAMED
export const clip = (t, n = 28) => (t && t.length > n ? t.slice(0, n) + "…" : t || "")
export const shortDevice = (id) => (id ? String(id).replace(/^dev_/, "").slice(0, 8) : null)

// x min ago
const JUST_NOW = "เมื่อสักครู่"
const PREFIX = { requested: "ขอเมื่อ", played: "เล่นเมื่อ", plain: "" }

export const agoText = (epoch) => {
    const sec = Math.max(0, Math.floor((Date.now() - epoch) / 1000))
    if (sec < 60) return JUST_NOW
    const min = Math.floor(sec / 60)
    return min < 60 ? `${min} นาทีที่แล้ว` : `${Math.floor(min / 60)} ชั่วโมงที่แล้ว`
}

export const agoLabel = (kind, epoch) => {
    const t = agoText(epoch)
    const pre = PREFIX[kind] ?? ""
    if (!pre) return t
    return t === JUST_NOW ? `${pre}${t}` : `${pre} ${t}`
}

export const agoSpan = (epoch, kind = "requested") =>
    `<span data-ago="${epoch}" data-kind="${esc(kind)}">${agoLabel(kind, epoch)}</span>`

const tickAgo = () => document.querySelectorAll("[data-ago]").forEach((el) => {
    const next = agoLabel(el.dataset.kind, Number(el.dataset.ago))
    if (el.textContent !== next) el.textContent = next
})

export const startAgoTicker = () => setInterval(tickAgo, 30000)
