import { $, esc } from "../lib/dom.js"
import { icon } from "../lib/icons.js"
import { agoSpan, shortDevice, whoOf } from "../lib/text.js"
import { watchUrl, YT_ID_RE, ytThumbnail } from "../lib/youtube.js"
import { showToast } from "../lib/toast.js"
import { isSpeaker } from "./player.js"
import { songById, state } from "./state.js"

// helpers
const ytLink = (r, cls, inner, attrs = "") => `<a class="${cls}" href="${watchUrl(r.youtubeId)}" target="_blank" rel="noopener" ${attrs}>${inner}</a>`
const OPEN_LABEL = 'aria-label="เปิดใน YouTube"'
const noteStrip = (note) => (note ? `<div class="note-strip">${icon("note", 15)}<span>${esc(note)}</span></div>` : "")
const titleAnchor = (r) => ytLink(r, "s-title", `${esc(r.title || r.youtubeId)}${icon("external", 13)}`)
const thumbImg = (r) => `<img src="${esc(ytThumbnail(r.youtubeId))}" alt="" loading="lazy" />`
const removeBtn = `<button type="button" class="x-btn" data-act="remove" aria-label="เอาเพลงนี้ออก (ข้ามหรือลบ)" title="ข้ามหรือลบเพลงนี้">${icon("x", 20)}</button>`

export const devChip = (r) => (r.source === "admin" || !r.deviceId
    ? '<span class="chip pr">PR เพิ่มเอง</span>'
    : `<button type="button" class="chip dev" data-device="${esc(r.deviceId)}" title="ดูคำขอทั้งหมดของอุปกรณ์นี้">${esc(shortDevice(r.deviceId))}</button>`)
const metaLine = (r) => `<span class="who">${esc(whoOf(r))}</span> ${devChip(r)}`

const closePreview = (card) => {
    const box = card && card.querySelector(".song-preview")
    if (box) { box.innerHTML = ""; box.hidden = true }
}

export function togglePreview(card, r) {
    if (isSpeaker()) return showToast("เครื่องนี้เป็นลำโพงโรงเรียน ฟังตัวอย่างจากเครื่องอื่นแทนนะ (เสียงจะดังทั้งโรงเรียน)", "error")
    const queuePanel = $("admin-queue")
    const opening = state.previewId !== r.id
    queuePanel.querySelectorAll(".song").forEach(closePreview)
    state.previewId = null

    if (opening && YT_ID_RE.test(r.youtubeId || "")) {
        const box = card.querySelector(".song-preview")
        const iframe = document.createElement("iframe")
        iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(r.youtubeId)}?autoplay=1&playsinline=1`
        iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture")
        iframe.setAttribute("allowfullscreen", "")
        iframe.title = `ตัวอย่าง ${r.title || ""}`
        box.appendChild(iframe)
        box.hidden = false
        state.previewId = r.id
    }
    queuePanel.querySelectorAll(".song").forEach((c) => { const rr = songById(c.dataset.id); if (rr) renderTop(c, rr) })
}

// queue card
function renderTop(card, r) {
    const open = state.previewId === r.id
    card.querySelector(".s-top").innerHTML = `
        <div class="s-head">
            <button type="button" class="thumb-btn" data-act="preview" aria-label="${open ? "ปิดตัวอย่าง" : "ดูตัวอย่าง"}" aria-expanded="${open}">
                ${thumbImg(r)}
                <span class="ov">${icon(open ? "x" : "eye", 12)}${open ? "ปิด" : "ตัวอย่าง"}</span>
            </button>
            <div class="s-head-side">
                <span>${agoSpan(r.createdAt, "plain")}</span>
                ${r.reviewed ? `<span class="chip reviewed">${icon("check", 11)}ตรวจแล้ว</span>` : '<span class="unreviewed">ยังไม่ได้ตรวจ</span>'}
            </div>
        </div>
        ${removeBtn}`
}

function renderQueueCard(card, r, idx, total) {
    card.querySelector(".song-rail").innerHTML = `
        <button type="button" class="rail-btn grip" data-act="grip" aria-label="ลากเพื่อสลับลำดับ" title="ลากเพื่อสลับลำดับ">${icon("grip", 20)}</button>
        <button type="button" class="rail-btn" data-act="up" aria-label="เลื่อนขึ้น" ${idx === 0 ? "disabled" : ""}>${icon("up", 22)}</button>
        <button type="button" class="rail-btn" data-act="down" aria-label="เลื่อนลง" ${idx === total - 1 ? "disabled" : ""}>${icon("down", 22)}</button>`
    renderTop(card, r)
    card.querySelector(".s-rest").innerHTML = `
        <div class="s-titleline">
            <button type="button" class="check" data-act="review" role="checkbox" aria-checked="${r.reviewed}" aria-pressed="${r.reviewed}" aria-label="ตรวจแล้ว" title="${r.reviewed ? "ยกเลิกเครื่องหมายตรวจแล้ว" : "ทำเครื่องหมายว่าตรวจแล้ว"}">${icon("check", 16)}</button>
            ${titleAnchor(r)}
        </div>
        <div class="s-meta">${metaLine(r)}</div>
        ${r.note ? `<div>${noteStrip(r.note)}</div>` : ""}
        <button type="button" class="btn-play" data-act="play">${icon("play", 18)}เล่นเลย</button>`
}

const queueSig = (r, idx, all) => JSON.stringify([r.title, r.nickname, r.note, r.reviewed, r.source, r.deviceId, r.createdAt, idx === 0, idx === all.length - 1, state.previewId === r.id])
function makeQueueCard() {
    const el = document.createElement("article")
    el.className = "song"
    el.innerHTML = '<div class="song-rail"></div><div class="song-main"><div class="s-top"></div><div class="song-preview" hidden></div><div class="s-rest"></div></div>'
    return el
}
function reconcileQueue(items) {
    const panel = $("admin-queue")
    const keep = new Set(items.map((i) => i.id))
        ;[...panel.children].forEach((c) => { if (!c.dataset.id || !keep.has(c.dataset.id)) c.remove() })

    let prev = null
    items.forEach((r, idx) => {
        let el = [...panel.children].find((c) => c.dataset.id === r.id)
        if (!el) { el = makeQueueCard(); el.dataset.id = r.id }

        const sig = queueSig(r, idx, items)
        if (el.dataset.sig !== sig) { renderQueueCard(el, r, idx, items.length); el.dataset.sig = sig }

        const expected = prev ? prev.nextElementSibling : panel.firstElementChild
        if (expected !== el) panel.insertBefore(el, expected)
        prev = el
    })
    if (state.previewId && !keep.has(state.previewId)) state.previewId = null
}
export function renderQueue(queue) {
    if (queue.length === 0) {
        $("admin-queue").innerHTML = '<p class="empty-hint">คิวว่าง รอคำขอจากนักเรียน หรือกด "เพิ่มเพลง"</p>'
        state.previewId = null
    } else reconcileQueue(queue)
}

// on-air
export function renderOnAir(r) {
    const el = $("admin-onair")
    el.classList.toggle("idle", !r)

    if (!r) {
        const auto = state.snap && state.snap.session.autoplay
        return el.innerHTML = `
<div class="onair-head"><span>กำลังเปิดอยู่</span></div>
<div class="onair-idle-text">ยังไม่มีเพลงกำลังเปิด<br>${auto ? "เมื่อมีเพลงในคิว ระบบจะดึงเพลงแรกมาเปิดให้เอง" : 'เลือกเพลงจากคิวแล้วกด "เล่นเลย"'}</div>`
    }

    el.innerHTML = `
<div class="onair-head"><span>กำลังเปิดอยู่</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
${removeBtn}
<div class="onair-song">
    ${ytLink(r, "thumb-link", `<img class="thumb" src="${esc(ytThumbnail(r.youtubeId))}" alt="" />`, OPEN_LABEL)}
    <div class="onair-text">${ytLink(r, "onair-title", esc(r.title || r.youtubeId))}</div>
</div>
<div class="onair-meta s-meta">${metaLine(r)}</div>
${noteStrip(r.note)}
<div class="onair-actions">
    <button type="button" class="btn done" data-act="played">${icon("check", 18)}เล่นจบแล้ว</button>
    <button type="button" class="btn" data-act="requeue">${icon("undo", 18)}กลับเข้าคิว</button>
</div>
${ytLink(r, "link-btn onair-open", `${icon("external", 15)}เปิดใน YouTube`)}`
}

// played tab
export const playedCard = (r) => `
<article class="song no-rail" data-id="${esc(r.id)}">
    <div class="song-main">
        <div class="s-head">
            ${ytLink(r, "thumb-btn", thumbImg(r), OPEN_LABEL)}
            <div class="s-head-side"><span>${r.playedAt ? agoSpan(r.playedAt, "played") : ""}</span></div>
        </div>
        <div class="s-titleline">${titleAnchor(r)}</div>
        <div class="s-meta">${metaLine(r)}</div>
        ${noteStrip(r.note)}
        <div class="btn-row">
            <button type="button" class="btn small" data-act="replay">${icon("play", 14)}เปิดอีกครั้ง</button>
            <button type="button" class="btn small" data-act="requeue">${icon("undo", 15)}กลับเข้าคิว</button>
        </div>
    </div>
</article>`
