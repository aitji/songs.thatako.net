import { esc } from "../lib/dom.js"
import { api } from "../core/api.js"
import { confirm, modalBody, openInfoModal } from "../lib/modal.js"
import { showToast } from "../lib/toast.js"
import { agoSpan, shortDevice, STATUS_LABEL, whoOf } from "../lib/text.js"
import { watchUrl, ytThumbnail } from "../lib/youtube.js"
import { act, post } from "./actions.js"

const rowHtml = (r) => `
    <div class="row ${r.status}">
        <div class="row-main">
            <a class="thumb-link" href="${watchUrl(r.youtubeId)}" target="_blank" rel="noopener"><img class="thumb sm" src="${esc(ytThumbnail(r.youtubeId))}" alt="" /></a>
            <div class="row-body">
                <div class="row-title">${esc(r.title || r.youtubeId)}</div>
                <div class="row-meta"><span class="who">${esc(whoOf(r))} </span>${agoSpan(r.createdAt)}</div>
                <div class="status-line2"><span class="status-badge st-${r.status}">${STATUS_LABEL[r.status] || r.status}</span>${r.skipReason ? esc(r.skipReason) : ""}</div>
            </div>
        </div>
        ${r.note ? `<div class="row-extra"><div class="note-strip"><span>${esc(r.note)}</span></div></div>` : ""}
    </div>`

export async function openDeviceModal(deviceId) {
    const short = shortDevice(deviceId)
    openInfoModal(`อุปกรณ์ ${short}`, '<p class="empty-hint">กำลังโหลด...</p>')

    let data
    try { data = await api.get(`/api/admin/device/${encodeURIComponent(deviceId)}/requests`) }
    catch { if (modalBody()) modalBody().innerHTML = '<p class="empty-hint">โหลดไม่สำเร็จ</p>'; return }
    const body = modalBody()
    if (!body) return

    const rows = (data.requests || []).slice().reverse().map(rowHtml).join("")
    body.innerHTML = `
        <div class="reset-quota"><button type="button" class="btn small danger block" data-reset-quota>รีเซ็ตโควตาของผู้ใช้นี้</button></div>
        ${rows || '<p class="empty-hint">ผู้ใช้นี้ยังไม่มีคำขอเพลง</p>'}`

    body.querySelector("[data-reset-quota]").addEventListener("click", async () => {
        const ok = await confirm({
            title: "รีเซ็ตโควตาของผู้ใช้นี้?",
            bodyHtml: `<p>อุปกรณ์ ${esc(short)} จะขอเพลงได้เต็มโควตาอีกครั้ง เพลงเดิมยังอยู่ในคิว</p>`,
            confirmLabel: "รีเซ็ต",
        })
        if (!ok) return
        const done = await act(() => post("/api/admin/queue/clear", { scope: "user_quota", deviceId }), "รีเซ็ตไม่สำเร็จ ลองอีกครั้ง")
        if (done !== undefined) showToast("รีเซ็ตโควตาแล้ว")
    })
}
