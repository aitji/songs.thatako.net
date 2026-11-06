import { $ } from "../lib/dom.js"
import { icon } from "../lib/icons.js"
import { bangkokTimeStr } from "../core/time.js"
import {
    LABEL, becomeSpeaker, control, nextSong, onPlayerChange, pl, playbackView,
    prevSong, speakerOnline, stopBeingSpeaker,
} from "./player.js"

const SKIP_MS = 10000
const RESTART_AFTER_MS = 5000
const HOLD_MS = 1500
const ACTION_TEXT = {
    pause: "สั่งหยุดเพลง",
    play: "สั่งเล่นเพลง",
    seek: "เลื่อนตำแหน่งเพลง",
    volume: "ปรับเสียง",
    mute: "เปิด/ปิดเสียง",
    claim: "ย้ายลำโพงมาที่เครื่องนี้",
    release: "เลิกเป็นลำโพง"
}

const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`
}

const hold = {}
const held = (key, real) => (hold[key] && hold[key].until > Date.now() ? hold[key].value : real)
const setHold = (key, value) => { hold[key] = { value, until: Date.now() + HOLD_MS } }

let el = null
let dragging = false
let volTimer = 0

const SKELETON = `
<div class="pl-head">
    <span class="pl-dot" aria-hidden="true"></span>
    <div class="pl-who"><div class="pl-title"></div><div class="pl-sub"></div></div>
    <button type="button" class="btn small" data-pl="role"></button>
</div>
<button type="button" class="pl-gesture" data-pl="unlock" hidden>${icon("volume", 20)}แตะที่นี่เพื่อเริ่มเสียง</button>
<div class="yt-box" id="yt-box" hidden></div>
<div class="pl-ctl">
    <div class="pl-row">
        <span class="pl-t" data-r="cur">0:00</span>
        <input class="pl-range" type="range" min="0" max="0" step="1000" value="0" data-pl="seek" aria-label="ตำแหน่งเพลง" />
        <span class="pl-t" data-r="dur">0:00</span>
    </div>
    <div class="pl-transport">
        <button type="button" class="pl-btn" data-pl="prev" aria-label="เพลงก่อนหน้า">${icon("prev", 20)}</button>
        <button type="button" class="pl-btn pl-txt" data-pl="back" aria-label="ย้อนกลับ 10 วินาที">−10</button>
        <button type="button" class="pl-btn pl-main" data-pl="toggle" aria-label="เล่น / หยุด"></button>
        <button type="button" class="pl-btn pl-txt" data-pl="fwd" aria-label="ข้ามไป 10 วินาที">+10</button>
        <button type="button" class="pl-btn" data-pl="next" aria-label="เพลงถัดไป" title="เพลงถัดไป">${icon("skip", 20)}</button>
    </div>
    <div class="pl-row">
        <button type="button" class="pl-btn pl-sm" data-pl="mute" aria-label="ปิดเสียง"></button>
        <input class="pl-range" type="range" min="0" max="100" step="1" value="100" data-pl="vol" aria-label="ระดับเสียง" />
        <span class="pl-t pl-volnum" data-r="vol">100</span>
    </div>
</div>
<div class="pl-note" aria-live="polite"></div>`

const q = (sel) => el.querySelector(sel)
const setText = (node, t) => { if (node.textContent !== t) node.textContent = t }
const setHtml = (node, h) => { if (node.dataset.h !== h) { node.dataset.h = h; node.innerHTML = h } }
const setDis = (btn, v) => { if (btn.disabled !== v) btn.disabled = v }
const setPct = (range) => {
    const max = Number(range.max) || 1
    range.style.setProperty("--pct", `${Math.min(100, (Number(range.value) / max) * 100)}%`)
}

function paint() {
    if (!el) return
    const v = playbackView()
    const pb = pl.pb
    const mine = pl.speaker
    const online = speakerOnline()
    const hasNp = !!pl.np
    const canCmd = hasNp && (mine || online)

    // header
    const dot = q(".pl-dot"), title = q(".pl-title"), sub = q(".pl-sub"), role = q('[data-pl="role"]')
    let dotCls = "pl-dot", t, s, roleLabel, rolePrimary = false
    if (mine) { dotCls += " on"; t = "เครื่องนี้คือลำโพง"; s = LABEL; roleLabel = "เลิกเป็นลำโพง" }
    else if (pb && pb.playerId && online) { dotCls += " on"; t = `ลำโพง: ${pb.playerLabel || "เครื่องอื่น"}`; s = "ควบคุมจากเครื่องนี้ได้"; roleLabel = "ย้ายมาที่เครื่องนี้" }
    else if (pb && pb.playerId) { dotCls += " off"; t = "ลำโพงขาดการเชื่อมต่อ"; s = pb.playerLabel || ""; roleLabel = "ใช้เครื่องนี้เป็นลำโพง"; rolePrimary = true }
    else { t = "ยังไม่มีเครื่องเปิดเพลง"; s = "เปิดหน้านี้บนคอมที่ต่อลำโพง แล้วกดปุ่ม"; roleLabel = "ใช้เครื่องนี้เป็นลำโพง"; rolePrimary = true }
    if (dot.className !== dotCls) dot.className = dotCls
    setText(title, t); setText(sub, s); setText(role, roleLabel)
    role.classList.toggle("primary", rolePrimary)
    setDis(role, pl.claiming)

    // speaker-only bits
    q("#yt-box").hidden = !mine
    q('[data-pl="unlock"]').hidden = !(mine && pl.needsGesture)

    // transport
    const playing = !pl.needsGesture && ["playing", "buffering", "loading"].includes(held("status", v.status)) && v.status !== "idle"
    const toggle = q('[data-pl="toggle"]')
    setHtml(toggle, icon(playing ? "pause" : "play", 26))
    setDis(toggle, !canCmd)
    setDis(q('[data-pl="back"]'), !canCmd)
    setDis(q('[data-pl="fwd"]'), !canCmd)
    setDis(q('[data-pl="next"]'), !hasNp && !(pl.snap && pl.snap.queue.length))
    const restart = canCmd && v.posMs > RESTART_AFTER_MS
    const prev = q('[data-pl="prev"]')
    setDis(prev, !restart && !(pl.snap && pl.snap.played.length))
    prev.title = restart ? "เริ่มเพลงนี้ใหม่" : "เพลงก่อนหน้า"

    // seek
    const seek = q('[data-pl="seek"]')
    setDis(seek, !canCmd || !v.durMs)
    if (!dragging) {
        const pos = held("seek", v.posMs)
        seek.max = String(v.durMs || 0)
        seek.value = String(Math.min(pos, v.durMs || 0))
        setText(q('[data-r="cur"]'), fmt(pos))
    }
    setText(q('[data-r="dur"]'), v.durMs ? fmt(v.durMs) : "-:--")
    setPct(seek)

    // volume
    const vol = q('[data-pl="vol"]')
    const muted = held("muted", v.muted)
    setDis(vol, !canCmd && !mine)
    setDis(q('[data-pl="mute"]'), !canCmd && !mine)
    if (document.activeElement !== vol) vol.value = String(held("vol", v.vol))
    setPct(vol)
    setText(q('[data-r="vol"]'), muted ? "ปิดเสียง" : String(vol.value))
    setHtml(q('[data-pl="mute"]'), icon(muted ? "volumeOff" : "volume", 18))
    q(".pl-ctl").classList.toggle("off", !canCmd)

    // note
    let note = ""
    if (pb && pb.needsGesture && !mine) note = "เครื่องลำโพงรอให้แตะหน้าจอ 1 ครั้งเพื่อเริ่มเสียง"
    else if (!hasNp) note = "ยังไม่มีเพลงที่กำลังเปิด"
    else if (!canCmd) note = "ยังไม่มีลำโพงออนไลน์ จึงสั่งเล่น/หยุดไม่ได้"
    else if (pb && pb.lastAction && ACTION_TEXT[pb.lastAction.what]) {
        const a = pb.lastAction
        note = `ล่าสุด ${bangkokTimeStr(a.at)} · ${a.local && a.what !== "claim" ? "ที่เครื่องลำโพง" : a.by} ${ACTION_TEXT[a.what]}`
    }
    setText(q(".pl-note"), note)
}

function onClick(e) {
    const btn = e.target.closest("[data-pl]")
    if (!btn || btn.disabled) return
    const v = playbackView()
    const act = btn.dataset.pl

    if (act === "role") return pl.speaker ? stopBeingSpeaker() : becomeSpeaker()
    if (act === "unlock") return control("play")
    if (act === "toggle") {
        const playing = !pl.needsGesture && ["playing", "buffering", "loading"].includes(held("status", v.status))
        setHold("status", playing ? "paused" : "playing")
        return control(playing ? "pause" : "play").then(paint)
    }

    if (act === "back" || act === "fwd") {
        const to = Math.max(0, Math.min(v.durMs || Infinity, v.posMs + (act === "fwd" ? SKIP_MS : -SKIP_MS)))
        setHold("seek", to)
        return control("seek", to)
    }

    if (act === "prev") {
        if (speakerOnline() || pl.speaker) { if (v.posMs > RESTART_AFTER_MS) { setHold("seek", 0); return control("seek", 0) } }
        return prevSong()
    }

    if (act === "next") return nextSong()
    if (act === "mute") {
        const to = !held("muted", v.muted)
        setHold("muted", to)
        return control("mute", to).then(paint)
    }
}

function onInput(e) {
    const r = e.target.closest("[data-pl]")
    if (!r) return
    if (r.dataset.pl === "seek") {
        dragging = true
        setText(q('[data-r="cur"]'), fmt(Number(r.value)))
        setPct(r)
    } else if (r.dataset.pl === "vol") {
        const val = Number(r.value)
        setHold("vol", val)
        setPct(r)
        setText(q('[data-r="vol"]'), String(val))
        clearTimeout(volTimer) // throttle
        volTimer = setTimeout(() => control("volume", val), 120)
    }
}

function onChange(e) {
    const r = e.target.closest('[data-pl="seek"]')
    if (!r) return
    dragging = false
    const to = Number(r.value)
    setHold("seek", to)
    control("seek", to)
}

export function initPlayerUi() {
    el = $("admin-player")
    el.innerHTML = SKELETON
    el.addEventListener("click", onClick)
    el.addEventListener("input", onInput)
    el.addEventListener("change", onChange)
    el.addEventListener("pointerup", () => { if (dragging) setTimeout(() => { dragging = false }, 0) })

    document.addEventListener("keydown", (e) => {
        if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
        const t = e.target
        if (t.closest && t.closest("input, textarea, select, button, a, [contenteditable], #ui-modal-root")) return
        if (document.body.classList.contains("modal-open")) return
        const tog = q('[data-pl="toggle"]')
        if (tog.disabled) return
        e.preventDefault()
        tog.click()
    })

    onPlayerChange(paint)
    setInterval(paint, 250)
    paint()
}
