import { ytThumbnail, watchUrl } from "../lib/youtube.js"
import { esc } from "../lib/dom.js"

const META_TIMEOUT = 4000
const cache = new Map()

// oembed from browser
async function fetchMeta(id) {
    if (cache.has(id)) return cache.get(id)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), META_TIMEOUT)
    let meta = { title: null, missing: false }
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(id))}&format=json`, { signal: ctrl.signal })
        if (res.status === 404) meta = { title: null, missing: true }
        else if (res.ok) meta = { title: (await res.json()).title || null, missing: false }
    } catch { /* blocked / offline -> no title */ }
    clearTimeout(timer)
    cache.set(id, meta)
    return meta
}

export function createPreview(el, { onResolved }) {
    let cur = { id: null, status: "idle" }

    const clear = () => { cur = { id: null, status: "idle" }; el.hidden = true; el.innerHTML = "" }
    function show(id) {
        if (cur.id === id) return
        cur = { id, status: "loading" }
        el.hidden = false
        el.innerHTML = `<img src="${esc(ytThumbnail(id))}" alt="" /><div><div class="pv-title">กำลังดึงชื่อเพลง...</div><div class="pv-sub">ตรวจสอบว่าใช่เพลงที่ต้องการ</div></div>`

        el.querySelector("img").addEventListener("error", () => {
            if (cur.id === id && cur.status === "loading") el.querySelector(".pv-sub").textContent = "ยังดูตัวอย่างไม่ได้ ตรวจสอบลิงก์อีกครั้ง"
        })

        fetchMeta(id).then((meta) => {
            if (cur.id !== id) return
            cur.status = meta.missing ? "missing" : "ok"
            el.querySelector(".pv-title").textContent = meta.missing ? "ไม่พบวิดีโอนี้" : (meta.title || "ลิงก์ถูกต้อง")
            el.querySelector(".pv-sub").textContent = meta.missing ? "วิดีโอถูกลบหรือเป็นส่วนตัว ลองเพลงอื่นนะ" : 'ถ้าใช่เพลงนี้ กด "ขอเพลง" ได้เลย'
            onResolved()
        })
    }

    return {
        show,
        clear,
        isMissing: (id) => cur.id === id && cur.status === "missing",
        hideSub(hidden) { const sub = el.querySelector(".pv-sub"); if (sub) sub.hidden = hidden },
    }
}
