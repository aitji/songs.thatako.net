import { esc } from "../lib/dom.js"
import { icon } from "../lib/icons.js"
import { agoSpan, STATUS_LABEL, whoOf } from "../lib/text.js"
import { confirmLeave } from "../lib/modal.js"
import { watchUrl, ytThumbnail } from "../lib/youtube.js"
import { queuePos, state } from "./state.js"

// helpers
const ytAttrs = (r) => `href="${watchUrl(r.youtubeId)}" data-yt="${esc(r.youtubeId)}" data-title="${esc(r.title || "")}"`
export const thumbLink = (r) => `<a class="yt-link thumb-link" ${ytAttrs(r)} aria-label="เปิดใน YouTube"><img class="thumb" src="${esc(ytThumbnail(r.youtubeId))}" alt="" loading="lazy" /></a>`
const titleLink = (r) => `<a class="yt-link title-link" ${ytAttrs(r)}>${esc(r.title || r.youtubeId)}</a>`
const reviewedChip = (r) => (r.reviewed ? `<span class="chip reviewed">${icon("check", 11)}ผ่านรีวิว</span>` : "")
const noteStrip = (note) => `<div class="note-strip row-note">${icon("note", 15)}<span><b>ถึง PR:</b> ${esc(note)}</span></div>`
export const initLeaveGuard = () => document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-yt]")
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
    e.preventDefault()
    confirmLeave({ youtubeId: a.dataset.yt, title: a.dataset.title })
})

// rows
export const queueRow = (q, i, mine) => `
    <div class="row${mine ? " mine" : ""}">
        <div class="row-main">
            <span class="idx">${i + 1}</span>
            ${thumbLink(q)}
            <div class="row-body">
                <div class="row-title">${titleLink(q)}</div>
                <div class="row-meta">
                    <span class="who">${esc(whoOf(q))}</span> ${agoSpan(q.createdAt)}
                    ${mine ? '<span class="chip you">คุณ</span>' : ""}${reviewedChip(q)}
                    ${mine ? `<button type="button" class="edit-link" data-manage="${esc(q.id)}">${icon("pencil", 13)}แก้ไข</button>` : ""}
                </div>
            </div>
        </div>
    </div>`

export const playedRow = (p) => `
    <div class="row played">
        <div class="row-main">
            ${thumbLink(p)}
            <div class="row-body">
                <div class="row-title">${titleLink(p)}</div>
                <div class="row-meta"><span class="who">${esc(whoOf(p))}</span> ${p.playedAt ? agoSpan(p.playedAt, "played") : agoSpan(p.createdAt)}</div>
            </div>
        </div>
    </div>`

export const nowPlayingHtml = (np) => `
    <div class="onair-song">${thumbLink(np)}<div style="min-width:0">
        <a class="yt-link onair-title" ${ytAttrs(np)}>${esc(np.title || np.youtubeId)}</a>
    </div></div><div class="onair-meta">${esc(whoOf(np))} ${agoSpan(np.createdAt)}</div>`

export const mineRow = (r) => {
    const bits = [`<span class="status-badge st-${r.status}">${STATUS_LABEL[r.status] || r.status}</span>`]
    if (r.status === "queued") {
        const idx = queuePos(r.id)
        if (idx !== null) bits.push(idx === 0 ? "เป็นคิวถัดไป" : `มี ${idx} เพลงอยู่ก่อนคุณ`)
    }
    if (r.status === "skipped" && r.skipReason) bits.push(`เหตุผล: ${esc(r.skipReason)}`)
    if (r.reviewed && (r.status === "queued" || r.status === "playing")) bits.push(reviewedChip(r))

    const canEdit = r.status === "queued" || r.status === "playing"
    const actions = canEdit ? `<div class="row-actions">
            <button type="button" class="btn small" data-manage="${esc(r.id)}">${icon("pencil", 15)}แก้ไข</button>
            ${r.status === "queued" ? `<button type="button" class="btn small danger" data-remove="${esc(r.id)}">${icon("trash", 15)}ลบ</button>` : ""}
        </div>` : ""

    return `
    <div class="row ${r.status}${r.id === state.highlightId ? " is-new" : ""}">
        <div class="row-main">
            ${thumbLink(r)}
            <div class="row-body">
                <div class="row-title">${titleLink(r)}</div>
                <div class="row-meta"><span class="who">${esc(whoOf(r))}</span> ${agoSpan(r.createdAt)}</div>
                <div class="status-line2">${bits.join("")}</div>
            </div>
        </div>
        ${r.note || actions ? `<div class="row-extra">${r.note ? noteStrip(r.note) : ""}${actions}</div>` : ""}
    </div>`
}
