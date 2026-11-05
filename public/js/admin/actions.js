import { api } from "../core/api.js"
import { esc } from "../lib/dom.js"
import { openModal } from "../lib/modal.js"
import { showToast } from "../lib/toast.js"
import { clip, whoOf } from "../lib/text.js"
import { ytThumbnail } from "../lib/youtube.js"
import { state } from "./state.js"

const reviewing = new Set()
const q = (id, action) => `/api/admin/queue/${encodeURIComponent(id)}/${action}`

// helpers
export const post = (path, body) => api.post(path, body)
export const act = async (fn, failMsg = "ทำรายการไม่สำเร็จ ลองอีกครั้ง") => {
    try { return await fn() }
    catch (err) {
        showToast(err.status === 401 ? "หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่" : failMsg, "error")
        return undefined
    }
}
export const reorder = (ids) => act(() => post("/api/admin/queue/reorder", { orderedIds: ids }), "จัดลำดับไม่สำเร็จ ลองอีกครั้ง")
export const playNow = async (r) => {
    const prev = state.snap && state.snap.nowPlaying
    const ok = await act(() => post(q(r.id, "play")))
    if (ok !== undefined && prev && prev.id !== r.id) {
        showToast(`เปิด "${clip(r.title || r.youtubeId)}" แล้ว เพลง "${clip(prev.title || prev.youtubeId)}" ย้ายไปท้ายคิว`)
    }
}

export const markPlayed = (r) => act(() => post(q(r.id, "played")))
export const requeue = async (r) => {
    const ok = await act(() => post(q(r.id, "requeue")))
    if (ok !== undefined) showToast("ย้ายกลับเข้าคิวแล้ว (ท้ายคิว)")
}

export const toggleReview = async (r) => {
    if (reviewing.has(r.id)) return
    reviewing.add(r.id)
    await act(() => post(q(r.id, "review"), { reviewed: !r.reviewed }))
    reviewing.delete(r.id)
}

export const move = async (id, dir) => {
    if (!state.snap) return
    const ids = state.snap.queue.map((x) => x.id)
    const idx = ids.indexOf(id)
    const to = idx + dir
    if (idx === -1 || to < 0 || to >= ids.length) return
    ;[ids[idx], ids[to]] = [ids[to], ids[idx]]
    await reorder(ids)
}

const summaryHtml = (r) => `<img class="thumb" src="${esc(ytThumbnail(r.youtubeId))}" alt="" /><div style="min-width:0"><div class="mh-title">${esc(r.title || r.youtubeId)}</div><div class="mh-sub">${esc(whoOf(r))}</div></div>`
export async function removeSheet(r) {
    const res = await openModal({
        title: "เอาเพลงนี้ออก",
        headerHtml: summaryHtml(r),
        fields: [
            {
                id: "mode", type: "radio", default: "skip", options: [
                    { value: "skip", label: "ข้ามเพลง", desc: "ผู้ขอจะเห็นว่าเพลงถูกข้าม (พร้อมเหตุผลถ้าใส่) ไม่เสียโควตา", actionLabel: "ข้ามเพลง" },
                    { value: "trash", label: "ลบทิ้ง", desc: "หายไปจากคิวและรายการของผู้ขอเลย เหมาะกับเพลงที่ไม่เหมาะสมหรือสแปม", actionLabel: "ลบทิ้ง", danger: true },
                ],
            },
            { id: "reason", type: "text", label: "เหตุผล (ไม่บังคับ ผู้ขอจะเห็น)", placeholder: "เช่น ไม่เหมาะกับเช้านี้", maxlength: 80, showWhen: { id: "mode", value: "skip" } },
        ],
        actions: [{ label: "ยกเลิก", value: "cancel" }, { label: "ข้ามเพลง", value: "confirm", variant: "ink", follow: true }],
    })
    if (!res || res.action !== "confirm") return

    if (res.values.mode === "trash") {
        const ok = await act(() => post(q(r.id, "delete")))
        if (ok !== undefined) showToast("ลบเพลงแล้ว")
    } else {
        const ok = await act(() => post(q(r.id, "skip"), { reason: res.values.reason || null }))
        if (ok !== undefined) showToast("ข้ามเพลงแล้ว")
    }
}
