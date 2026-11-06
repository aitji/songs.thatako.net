import { $ } from "../lib/dom.js"
import { renderOnAir, renderQueue, playedCard } from "./cards.js"
import { refreshAdd } from "./addsong.js"
import { applySettingsInputs, applySettingsStatus } from "./settings.js"
import { onSnapshot as playerSnapshot } from "./player.js"
import { isStale, state } from "./state.js"

const EMPTY_PLAYED = '<p class="empty-hint">ยังไม่มีเพลงที่เปิดแล้ว</p>'

// full redraw
export function render(snap) {
    state.snap = snap
    applySettingsStatus()
    applySettingsInputs(snap)

    renderOnAir(snap.nowPlaying)
    $("queue-count").textContent = snap.queue.length ? `(${snap.queue.length})` : ""
    renderQueue(snap.queue)
    $("admin-played").innerHTML = snap.played.length ? snap.played.map(playedCard).join("") : EMPTY_PLAYED

    const people = new Set([snap.nowPlaying, ...snap.queue, ...snap.played]
        .filter((r) => r && r.source !== "admin" && r.deviceId)
        .map((r) => r.deviceId))
    $("stat-queue").textContent = snap.queue.length
    $("stat-played").textContent = snap.played.length
    $("stat-people").textContent = people.size
    $("tab-queue-badge").hidden = snap.queue.length === 0

    refreshAdd()
}

// held updates
export function onSnapshot(snap) {
    if (isStale(snap, state.pending || state.snap)) return
    playerSnapshot(snap)
    if (state.dragging) { state.pending = snap; return }
    render(snap)
}
