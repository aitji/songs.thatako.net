import { $, spinnerHtml, toggleWrap } from "../lib/dom.js"
import { api } from "../core/api.js"
import { showToast } from "../lib/toast.js"
import { createUrlField } from "../lib/urlfield.js"
import { state } from "./state.js"

let field = null
const isDupe = (p) => {
    const s = state.snap
    return !!s && [s.nowPlaying, ...s.queue, ...s.played].some((r) => r && r.youtubeId === p.id)
}

export const refreshAdd = () => { if (field) { field.render(); syncBtn() } }
function syncBtn() {
    const p = field.parsed()
    $("add-song-btn").disabled = p.kind !== "ok" || isDupe(p)
}

// pr: add song via link
export function initAddSong() {
    const toggle = $("add-toggle")
    const wrap = $("add-wrap")
    const url = $("add-youtube-url")
    const nick = $("add-nickname")
    const btn = $("add-song-btn")
    const label = $("add-song-label")

    field = createUrlField({
        input: url,
        msg: $("add-url-msg"),
        verdict: (p) => (isDupe(p) ? "เพลงนี้อยู่ในคิวหรือเปิดไปแล้ว" : null),
        onChange: syncBtn,
    })

    toggle.addEventListener("click", () => {
        const open = wrap.hidden
        toggleWrap(toggle, wrap, open)
        if (open) url.focus({ preventScroll: true })
    })

    $("add-song-form").addEventListener("submit", async (e) => {
        e.preventDefault()
        if (btn.disabled) return
        btn.disabled = true
        label.innerHTML = spinnerHtml("กำลังเพิ่ม...")
        try {
            await api.post("/api/admin/queue/add", { youtubeUrl: field.parsed().url, nickname: nick.value.trim() || null })
            field.clear()
            nick.value = ""
            showToast("เพิ่มเพลงเข้าคิวแล้ว")
        } catch (err) {
            showToast(err.code === "duplicate_song" ? "เพลงนี้อยู่ในคิวแล้ว" : "เพิ่มเพลงไม่สำเร็จ", "error")
        }
        label.textContent = "เพิ่มเข้าคิว"
        syncBtn()
    })
}
