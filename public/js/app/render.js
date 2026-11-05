import { $, esc } from "../lib/dom.js"
import { computeLiveStatus } from "../core/time.js"
import { capOf, myIds, queuePos, state, usedQuota } from "./state.js"
import { mineRow, nowPlayingHtml, playedRow, queueRow } from "./rows.js"
import { shortDevice } from "../lib/text.js"

const LONG_QUEUE = 12
const SKELETON = '<div class="skeleton skeleton-line w-40"></div>'

// status pill
export function renderLiveStatus() {
    if (!state.snapshot) return
    const s = computeLiveStatus(state.snapshot.session)
    const el = $("status-line")
    el.className = `status-pill ${s.open ? "is-open" : "is-closed"}`
    el.innerHTML = `<span class="status-dot"></span><span>${esc(s.label)}</span>`
    state.open = s.open
}

function renderContext() {
    const el = $("now-playing-context")
    const np = state.snapshot && state.snapshot.nowPlaying
    let text = ""

    if (np && state.mine.some((r) => r.id === np.id)) text = "นี่คือเพลงของคุณ กำลังเปิดอยู่ตอนนี้"
    else {
        let best = null
        state.mine.filter((r) => r.status === "queued").forEach((r) => {
            const idx = queuePos(r.id)
            if (idx !== null && (best === null || idx < best)) best = idx
        })
        if (best !== null) text = best === 0 ? "เพลงของคุณจะเปิดเป็นเพลงถัดไป" : `เพลงของคุณอยู่ในคิว มี ${best} เพลงก่อนหน้า`
    }
    el.hidden = !text
    el.textContent = text
}

export function renderSnapshot() {
    const snap = state.snapshot
    if (!snap) return
    const mine = myIds()
    const np = snap.nowPlaying

    $("onair").classList.toggle("idle", !np)
    $("onair-eq").hidden = !np
    $("now-playing").innerHTML = np
        ? nowPlayingHtml(np)
        : '<div class="onair-idle-text">ยังไม่มีเพลงกำลังเปิด เมื่อ PR เริ่มเปิดจะแสดงที่นี่</div>'

    $("seg-queue-n").textContent = snap.queue.length || ""
    $("seg-played-n").textContent = snap.played.length || ""
    $("queue-list").innerHTML = snap.queue.length
        ? snap.queue.map((q, i) => queueRow(q, i, mine.has(q.id))).join("")
        : '<p class="empty-hint">คิวว่างอยู่ ขอเพลงแรกได้เลย</p>'
    $("recent-played-list").innerHTML = snap.played.length
        ? snap.played.slice(0, 10).map(playedRow).join("")
        : '<p class="empty-hint">ยังไม่มีเพลงที่เปิดแล้ว</p>'

    const warn = $("queue-warning")
    warn.hidden = snap.queue.length < LONG_QUEUE
    if (!warn.hidden) warn.textContent = `คิวค่อนข้างยาว (${snap.queue.length} เพลง) เพลงที่ขอใหม่อาจไม่ได้เปิดทันภายในเวลารับเพลงวันนี้`

    renderContext()
}

export function renderMine() {
    const cap = capOf()
    const used = usedQuota()

    $("quota-summary").innerHTML = cap === null ? SKELETON : `
        <div class="quota-row${used >= cap ? " full" : ""}">
            <span>${used} / ${cap} เพลง</span>
            <div class="quota-track"><div class="quota-fill" style="width:${cap > 0 ? Math.min(100, (used / cap) * 100) : 0}%"></div></div>
        </div>
        <div class="hint" style="margin-top:10px">เพลงที่ถูกข้าม ถูกลบ หรือซ้ำ จะไม่นับรวมในโควตา</div>
        <div class="device-id-row">เลขอุปกรณ์ <span class="chip dev">${esc(shortDevice(state.deviceId))}</span></div>`

    $("mine-list").innerHTML = state.mine.length
        ? state.mine.slice().reverse().map(mineRow).join("")
        : '<p class="empty-hint">ยังไม่มีคำขอของคุณวันนี้ ไปที่แท็บ "ขอเพลง" ได้เลย</p>'

    $("tab-me-badge").hidden = !state.mine.some((r) => r.status === "queued" || r.status === "playing")
    renderContext()
}
