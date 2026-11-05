import { delegate, esc } from "../lib/dom.js"
import { api } from "../core/api.js"
import { openModal, confirm } from "../lib/modal.js"
import { showToast } from "../lib/toast.js"
import { STATUS_LABEL } from "../lib/text.js"
import { ytThumbnail } from "../lib/youtube.js"
import { ERROR_MESSAGES } from "./messages.js"
import { setMine, state } from "./state.js"

const byId = (id) => state.mine.find((x) => x.id === id)
const own = (id, action) => `/api/requests/${encodeURIComponent(id)}/${action}`

export async function refreshMine() {
    try {
        const data = await api.get(`/api/requests/mine?deviceId=${encodeURIComponent(state.deviceId)}`)
        setMine(data.requests)
    } catch { /* keep last list */ }
}

// edit
async function openManage(r) {
    const res = await openModal({
        title: "แก้ไขคำขอ",
        headerHtml: `<img class="thumb" src="${esc(ytThumbnail(r.youtubeId))}" alt="" /><div style="min-width:0"><div class="mh-title">${esc(r.title || r.youtubeId)}</div><div class="mh-sub">${esc(STATUS_LABEL[r.status] || r.status)}</div></div>`,
        fields: [
            { id: "nickname", type: "text", label: "ชื่อเล่น", default: r.nickname || "", maxlength: 24, placeholder: "ไม่ใส่ก็ได้" },
            { id: "note", type: "textarea", label: "ข้อความถึง PR", default: r.note || "", maxlength: 120, placeholder: "เช่น ขอให้เปิดหลังประกาศเขต", hint: "เห็นเฉพาะ PR" },
        ],
        actions: [{ label: "ยกเลิก", value: "cancel" }, { label: "บันทึก", value: "save", variant: "primary" }],
        secondary: r.status === "queued" ? [{ label: "ลบเพลงนี้ออกจากคิว", value: "remove" }] : [],
    })
    if (!res) return
    if (res.action === "remove") return removeMine(r)
    if (res.action !== "save") return

    // only changed fields
    const patch = { deviceId: state.deviceId }
    if (res.values.nickname !== (r.nickname || "")) patch.nickname = res.values.nickname
    if (res.values.note !== (r.note || "")) patch.note = res.values.note
    if (Object.keys(patch).length === 1) return showToast("ไม่มีอะไรเปลี่ยน")

    try {
        await api.post(own(r.id, "update"), patch)
        showToast("บันทึกแล้ว")
    } catch (err) { showToast(ERROR_MESSAGES[err.code] || "บันทึกไม่สำเร็จ ลองอีกครั้ง", "error") }
    refreshMine()
}

// remove
async function removeMine(r) {
    const ok = await confirm({
        title: "ลบเพลงนี้ออกจากคิว?",
        bodyHtml: `<p>'${esc(r.title || r.youtubeId)}' จะถูกลบ และคืนโควตาให้ 1 เพลง</p>`,
        confirmLabel: "ลบออกจากคิว", danger: true,
    })
    if (!ok) return
    try {
        await api.post(own(r.id, "remove"), { deviceId: state.deviceId })
        showToast("ลบแล้ว คืนโควตาให้ 1 เพลง")
    } catch (err) { showToast(ERROR_MESSAGES[err.code] || "ลบไม่สำเร็จ ลองอีกครั้ง", "error") }
    refreshMine()
}

export function initManage() {
    delegate(document, "click", "[data-manage]", (b) => { const r = byId(b.dataset.manage); if (r) openManage(r) })
    delegate(document, "click", "[data-remove]", (b) => { const r = byId(b.dataset.remove); if (r) removeMine(r) })
}
