import { $, spinnerHtml } from "../lib/dom.js"
import { api } from "../core/api.js"
import { createCaptcha } from "../core/turnstile.js"
import { showToast } from "../lib/toast.js"

const LOGIN_ERR = {
    too_many_attempts: "ลองรหัสผ่านผิดหลายครั้งเกินไป กรุณารอสักครู่",
    captcha_required: "รอระบบตรวจสอบความปลอดภัยสักครู่ แล้วลองใหม่",
    captcha_failed: "ตรวจสอบความปลอดภัยไม่ผ่าน ลองอีกครั้งนะ",
}

// session check
export function initAuth({ onAuthed }) {
    const form = $("login-form")
    const pass = $("password-input")
    const btn = $("login-btn")
    const label = $("login-btn-label")
    const captcha = createCaptcha({ action: "login" })
    let busy = false

    const showLogin = () => {
        $("login-section").style.display = ""
        pass.focus()
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault()
        if (busy || !pass.value) return

        const token = await captcha.ensure()
        if (!token) return // closed -> idle

        pass.classList.remove("is-error")
        busy = true
        pass.disabled = true
        btn.disabled = true
        label.innerHTML = spinnerHtml("กำลังเข้าสู่ระบบ...")

        try {
            await api.post("/api/admin/login", { password: pass.value, turnstileToken: token })
            onAuthed()
        } catch (err) {
            pass.classList.add("is-error")
            pass.value = ""
            showToast(LOGIN_ERR[err.code] || "รหัสผ่านไม่ถูกต้อง", "error")
        } finally {
            captcha.reset()
            busy = false
            pass.disabled = false
            btn.disabled = false
            label.textContent = "เข้าสู่ระบบ"
            if (pass.classList.contains("is-error")) pass.focus()
        }
    })

    $("logout-btn").addEventListener("click", async () => {
        await api.post("/api/admin/logout")
        location.reload()
    })

    api.get("/api/admin/me").then((r) => (r.authed ? onAuthed() : showLogin())).catch(showLogin)
}
