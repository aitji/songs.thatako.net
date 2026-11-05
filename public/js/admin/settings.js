import { $, esc, spinnerHtml } from "../lib/dom.js"
import { bangkokTimeStr, bangkokTimeToEpochToday, computeLiveStatus } from "../core/time.js"
import { confirm, openModal } from "../lib/modal.js"
import { showToast } from "../lib/toast.js"
import { act, post } from "./actions.js"
import { state } from "./state.js"

const DEFAULTS = { requestCap: 2, openTime: "06:30", closeTime: "07:45", requestOpen: true, autoplay: true }
const SAVE_LABEL = "บันทึกจำนวนและเวลา"

const statusEl = $("settings-status")
const openToggle = $("request-open-toggle")
const autoToggle = $("autoplay-toggle")
const capInput = $("cap-input")
const openTime = $("open-time-input")
const closeTime = $("close-time-input")
const saveBtn = $("settings-save-btn")
const resetBtn = $("settings-reset-btn")
const msgEl = $("settings-status-msg")

export function applySettingsStatus() {
    if (!state.snap) return
    const s = computeLiveStatus(state.snap.session)
    statusEl.className = `status-pill ${s.open ? "is-open" : "is-closed"}`
    statusEl.innerHTML = `<span class="status-dot"></span><span>${esc(s.label)}</span>`
}

export function applySettingsInputs(snap, force = false) {
    openToggle.checked = snap.session.requestOpen
    autoToggle.checked = snap.session.autoplay
    if (state.settingsDirty && !force) return
    capInput.value = snap.session.requestCap
    openTime.value = bangkokTimeStr(snap.session.openAt)
    closeTime.value = bangkokTimeStr(snap.session.closeAt)
}

const diffRow = (label, o, n) => `<li><span>${label}</span><span><span class="diff-old">${o}</span><span class="diff-new">${n}</span></span></li>`
const onOff = (v) => (v ? "เปิด" : "ปิด")

function resetDiffHtml() {
    if (!state.snap) return "<p>ไม่พบข้อมูลปัจจุบัน</p>"
    const cur = state.snap.session
    const rows = []
    if (cur.requestCap !== DEFAULTS.requestCap) rows.push(diffRow("จำนวนสูงสุดต่อคน", cur.requestCap, DEFAULTS.requestCap))
    if (bangkokTimeStr(cur.openAt) !== DEFAULTS.openTime) rows.push(diffRow("เปิดรับตอน", bangkokTimeStr(cur.openAt), DEFAULTS.openTime))
    if (bangkokTimeStr(cur.closeAt) !== DEFAULTS.closeTime) rows.push(diffRow("ปิดรับตอน", bangkokTimeStr(cur.closeAt), DEFAULTS.closeTime))
    if (cur.requestOpen !== DEFAULTS.requestOpen) rows.push(diffRow("รับคำขอเพลง", onOff(cur.requestOpen), onOff(DEFAULTS.requestOpen)))
    if (cur.autoplay !== DEFAULTS.autoplay) rows.push(diffRow("เล่นเพลงถัดไปอัตโนมัติ", onOff(cur.autoplay), onOff(DEFAULTS.autoplay)))
    if (!rows.length) return "<p>การตั้งค่าปัจจุบันตรงกับค่าเริ่มต้นอยู่แล้ว ไม่มีอะไรต้องเปลี่ยน</p>"
    return `<p>การตั้งค่าต่อไปนี้จะถูกเปลี่ยนกลับเป็นค่าเริ่มต้น:</p><ul class="diff-list">${rows.join("")}</ul>`
}

const CLEAR_FIELD = {
    id: "scope", type: "radio", default: "queued",
    options: [
        { value: "queued", label: "คิวที่รอเล่น" },
        { value: "played", label: "ประวัติเพลงที่เล่นแล้ว" },
        { value: "both", label: "ทั้งคิวและประวัติ" },
        { value: "user_quota", label: "รีเซ็ตโควตาทุกคน", desc: "ไม่ลบเพลง" },
    ],
}

// wire
export function initSettings() {
    const setBusy = (busy) => {
        ;[saveBtn, resetBtn, openToggle, autoToggle, capInput, openTime, closeTime].forEach((el) => { el.disabled = busy })
        $("settings-save-label").innerHTML = busy ? spinnerHtml("กำลังบันทึก...") : SAVE_LABEL
    }

        ;[capInput, openTime, closeTime].forEach((el) => el.addEventListener("input", () => { state.settingsDirty = true }))


    const bindToggle = (el, key, onMsg, offMsg) => el.addEventListener("change", async () => {
        const ok = await act(() => post("/api/admin/settings", { [key]: el.checked }), "เปลี่ยนการตั้งค่าไม่สำเร็จ")
        if (ok === undefined) el.checked = !el.checked
        else showToast(el.checked ? onMsg : offMsg)
    })
    bindToggle(openToggle, "requestOpen", "เปิดรับคำขอเพลงแล้ว", "หยุดรับคำขอเพลงชั่วคราว")
    bindToggle(autoToggle, "autoplay", "เปิดเล่นเพลงถัดไปอัตโนมัติ", "ปิดเล่นอัตโนมัติ")

    saveBtn.addEventListener("click", async () => {
        const cap = parseInt(capInput.value, 10)
        const patch = {}
        if (!Number.isNaN(cap)) patch.requestCap = cap
        if (openTime.value) patch.openAt = bangkokTimeToEpochToday(openTime.value)
        if (closeTime.value) patch.closeAt = bangkokTimeToEpochToday(closeTime.value)

        setBusy(true)
        msgEl.textContent = "กำลังบันทึก..."
        const ok = await act(() => post("/api/admin/settings", patch), "บันทึกการตั้งค่าไม่สำเร็จ ลองอีกครั้ง")
        if (ok !== undefined) { state.settingsDirty = false; msgEl.textContent = "บันทึกแล้ว"; showToast("บันทึกการตั้งค่าแล้ว") }
        setBusy(false)
    })

    resetBtn.addEventListener("click", async () => {
        if (!(await confirm({ title: "รีเซ็ตเป็นค่าเริ่มต้น", bodyHtml: resetDiffHtml(), confirmLabel: "รีเซ็ต" }))) return
        const done = await act(() => post("/api/admin/settings/reset"), "รีเซ็ตไม่สำเร็จ ลองอีกครั้ง")
        if (done === undefined) return
        state.settingsDirty = false
        applySettingsInputs(state.snap, true)
        showToast("รีเซ็ตการตั้งค่าเรียบร้อยแล้ว")
    })

    $("clear-btn").addEventListener("click", async () => {
        const result = await openModal({
            title: "ล้างคิว / โควตา",
            bodyHtml: "<p>เลือกสิ่งที่ต้องการล้าง ข้อมูลที่ล้างแล้วกู้คืนไม่ได้ (การล้างคิวหรือประวัติจะคืนโควตาให้ผู้ที่ถูกล้างโดยอัตโนมัติ)</p>",
            fields: [CLEAR_FIELD],
            actions: [{ label: "ยกเลิก", value: "cancel" }, { label: "ล้างเลย", value: "confirm", variant: "danger-solid" }],
        })
        if (!result || result.action !== "confirm") return
        const done = await act(() => post("/api/admin/queue/clear", { scope: result.values.scope }), "ล้างข้อมูลไม่สำเร็จ ลองอีกครั้ง")
        if (done !== undefined) showToast("ล้างข้อมูลเรียบร้อยแล้ว")
    })

    setInterval(applySettingsStatus, 30000) // open/close clock
}
