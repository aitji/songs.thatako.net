import { TURNSTILE_SITEKEY } from "./config.js"
import { resolvedTheme } from "./theme.js"
import { closeModal, modalBody, openModal } from "../lib/modal.js"

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
const TOKEN_TTL = 270_000

let loading = null
const load = () => {
    if (loading) return loading
    loading = new Promise((resolve, reject) => {
        if (window.turnstile) return resolve(window.turnstile)
        const s = document.createElement("script")
        s.src = SRC
        s.async = true
        s.onload = () => resolve(window.turnstile)
        s.onerror = () => { loading = null; reject(new Error("turnstile_load_failed")) }
        document.head.appendChild(s)
    })
    return loading
}

export function createCaptcha({ action }) {
    let token = ""
    let at = 0
    let pending = null

    const fresh = () => !!token && Date.now() - at < TOKEN_TTL

    async function run() {
        const done = openModal({
            title: "ตรวจสอบความปลอดภัย",
            bodyHtml: '<p>ยืนยันว่าคุณไม่ใช่บอทสักครู่ แล้วระบบจะไปต่อให้อัตโนมัติ</p><div class="ts-box"></div>',
            actions: [{ label: "ยกเลิก", value: "cancel" }],
        })
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
        const box = modalBody().querySelector(".ts-box")
        let id = null
        let closed = false
        done.then(() => {
            closed = true
            if (id !== null && window.turnstile) window.turnstile.remove(id)
        })

        let ts
        try { ts = await load() }
        catch { box.dataset.state = "error"; await done; return "" }
        if (closed) return ""

        id = ts.render(box, {
            sitekey: TURNSTILE_SITEKEY,
            action,
            theme: resolvedTheme(),
            size: "normal", // fixed 300px (flexible overflowed the sheet)
            language: "th",
            callback: (t) => {
                token = t
                at = Date.now()
                if (!closed) closeModal({ action: "ok" })
            },
        })

        const res = await done
        return res && res.action === "ok" && fresh() ? token : ""
    }

    return {
        token: () => (fresh() ? token : ""),
        ensure() {
            if (fresh()) return Promise.resolve(token)
            if (!pending) pending = run().finally(() => { pending = null })
            return pending
        },
        // tokens are single use -> call after every send
        reset() { token = ""; at = 0 },
    }
}
