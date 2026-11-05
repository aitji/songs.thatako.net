import { $, bindCounter, spinnerHtml, toggleWrap } from "../lib/dom.js"
import { api } from "../core/api.js"
import { KEYS, store } from "../core/store.js"
import { createCaptcha } from "../core/turnstile.js"
import { showToast } from "../lib/toast.js"
import { createUrlField } from "../lib/urlfield.js"
import { createPreview } from "./preview.js"
import { ERROR_MESSAGES, FORM_FAIL } from "./messages.js"
import { capOf, capReached, duplicateOf, state, usedQuota } from "./state.js"

const URL_HINT = "คัดลอกลิงก์จากปุ่มแชร์ของเพลงในยูทูบ แล้ววางที่นี่"
const FORM_ERR_FIELD = ["duplicate_song", "invalid_youtube_url"]

export function initForm({ onSent }) {
    const urlInput = $("youtube-url")
    const nickInput = $("nickname")
    const noteInput = $("note")
    const noteToggle = $("note-toggle")
    const noteWrap = $("note-wrap")
    const submitBtn = $("submit-btn")
    const submitLabel = $("submit-btn-label")
    const formStatus = $("form-status")
    const capNote = $("cap-note")
    let busy = false
    let dismissed = false
    let lastId = null

    const captcha = createCaptcha({ action: "request" })
    const preview = createPreview($("url-preview"), { onResolved: (id) => { field.render(); refresh(); autoChallenge(id) } })
    const field = createUrlField({
        input: urlInput,
        msg: $("url-msg"),
        hint: URL_HINT,
        verdict: (p) => duplicateOf(p.id) || (preview.isMissing(p.id) ? "ไม่พบวิดีโอนี้ ลองเพลงอื่นนะ" : null),
        onRender: (p) => {
            if (p.kind === "ok") { preview.show(p.id); preview.hideSub(!!duplicateOf(p.id)) }
            else preview.clear()
        },
        onChange: (p) => {
            const id = p.kind === "ok" ? p.id : null
            if (id !== lastId) { lastId = id; dismissed = false }
            refresh()
            autoChallenge(id)
        },
    })

    nickInput.value = store.get(KEYS.nick) || ""
    bindCounter(nickInput, $("nick-count"))
    const updNote = bindCounter(noteInput, $("note-count"))
    nickInput.addEventListener("input", () => store.set(KEYS.nick, nickInput.value.trim()))

    function block() {
        if (busy) return "busy"
        if (!state.open) return "closed"
        if (capReached()) return "cap"
        const p = field.parsed()
        if (p.kind !== "ok") return "url"
        if (duplicateOf(p.id)) return "dupe"
        if (preview.isMissing(p.id)) return "missing"
        if (!captcha.token()) return "captcha"
        return null
    }

    function autoChallenge(id) {
        if (dismissed || !id || block() !== "captcha") return
        if (!preview.isReady(id)) return
        if ($("panel-request").hidden || document.body.classList.contains("modal-open")) return
        captcha.ensure().then((t) => { if (!t) dismissed = true })
    }

    const LABEL = { closed: "ปิดรับคำขอแล้ว", cap: "ครบโควตาแล้ว" }
    function refresh() {
        const b = block()
        const hard = b === "captcha" ? null : b
        submitBtn.disabled = hard !== null
        if (!busy) submitLabel.textContent = LABEL[hard] || "ขอเพลง"

        const cap = capOf()
        if (cap === null) capNote.textContent = ""
        else if (capReached()) capNote.innerHTML = `<span class="full">คุณขอครบ ${cap} เพลงแล้ว ลบเพลงที่ยังรอคิวที่แท็บ "ของฉัน" เพื่อขอเพลงใหม่</span>`
        else capNote.textContent = `ขอได้ไม่เกิน ${cap} เพลงต่อคน (ใช้ไป ${usedQuota()}/${cap})`
    }

    function setBusy(on) {
        busy = on
        urlInput.disabled = on; nickInput.disabled = on; noteInput.disabled = on
        if (on) submitLabel.innerHTML = spinnerHtml("กำลังส่งคำขอ...")
        refresh()
    }

    const pasteBtn = $("paste-btn")
    if (!navigator.clipboard || !navigator.clipboard.readText) pasteBtn.hidden = true
    pasteBtn.addEventListener("click", async () => {
        try {
            urlInput.value = await navigator.clipboard.readText()
            field.refresh(true)
            urlInput.focus({ preventScroll: true })
        } catch { showToast("วางอัตโนมัติไม่ได้ ลองกดค้างที่ช่องแล้วเลือกวาง", "error") }
    })

    noteToggle.addEventListener("click", () => {
        const open = noteWrap.hidden
        toggleWrap(noteToggle, noteWrap, open)
        if (open) noteInput.focus({ preventScroll: true })
    })

    // send
    function resetForm() {
        field.clear()
        noteInput.value = ""
        updNote()
        toggleWrap(noteToggle, noteWrap, false)
    }

    $("request-form").addEventListener("submit", async (e) => {
        e.preventDefault()
        const b = block()
        if (b !== null && b !== "captcha") return

        const t = await captcha.ensure()
        if (!t) return dismissed = true
        if (block() !== null) return

        const nickname = nickInput.value.trim()
        const note = noteInput.value.trim()
        store.set(KEYS.nick, nickname)

        setBusy(true)
        formStatus.textContent = "กำลังส่งคำขอ..."
        try {
            const res = await api.post("/api/requests", {
                deviceId: state.deviceId,
                youtubeUrl: field.parsed().url,
                nickname: nickname || null,
                note: note || null,
                turnstileToken: t,
            })
            resetForm()
            formStatus.textContent = "ส่งคำขอเรียบร้อยแล้ว"
            showToast('ส่งคำขอแล้ว ดูสถานะได้ที่แท็บ "ของฉัน"')
            await onSent(res.request)
        } catch (err) {
            const message = ERROR_MESSAGES[err.code] || FORM_FAIL
            formStatus.textContent = message
            if (FORM_ERR_FIELD.includes(err.code)) field.fail(message)
            showToast(message, "error")
        } finally {
            captcha.reset() // single use
            dismissed = false
            setBusy(false)
        }
    })

    return { refresh() { field.render(); refresh() } }
}
