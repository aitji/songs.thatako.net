import { api } from "../core/api.js"
import { KEYS, store } from "../core/store.js"
import { esc } from "../lib/dom.js"
import { confirm } from "../lib/modal.js"
import { showToast } from "../lib/toast.js"
import { loadYT } from "../lib/ytapi.js"
import { act, post } from "./actions.js"

const HEARTBEAT_MS = 5000
const POLL_MS = 400
const ONLINE_MS = 30000
const BLOCKED_AFTER_MS = 3500
const SEEK_JUMP_MS = 1500
const YT_FATAL = [2, 100, 101, 150]
const ST = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }

// identity
const rand = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
const tabId = () => {
    try {
        let id = sessionStorage.getItem(KEYS.client)
        if (!id) { id = "cl_" + rand(); sessionStorage.setItem(KEYS.client, id) }
        return id
    } catch { return "cl_" + rand() }
}
const deviceLabel = () => {
    const ua = navigator.userAgent
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
        : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "Chromebook" : /Mac OS X/.test(ua) ? "Mac"
            : /Linux/.test(ua) ? "Linux" : "อุปกรณ์"
    const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox|FxiOS/.test(ua) ? "Firefox"
        : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : ""
    return br ? `${os} · ${br}` : os
}
export const clientId = tabId()
export const LABEL = deviceLabel()

// shared state
export const pl = {
    pb: null,
    skew: 0,
    np: null,
    snap: null,
    speaker: false,
    needsGesture: false,
    claiming: false,
}

const listeners = new Set()
export const onPlayerChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
const emit = () => listeners.forEach((fn) => fn())

export const isSpeaker = () => pl.speaker
export const serverNow = () => Date.now() + pl.skew
export const speakerOnline = () => {
    const pb = pl.pb
    return !!pb && !!pb.playerId && pb.online && serverNow() - pb.lastSeen < ONLINE_MS
}

export function playbackView() {
    const np = pl.np, pb = pl.pb
    const base = { vol: pb ? pb.volume : 100, muted: pb ? pb.muted : false }
    if (!np) return { ...base, status: "idle", posMs: 0, durMs: 0 }
    if (pl.speaker && eng.ready && eng.loadedId === np.id) {
        const { status, posMs, durMs, vol, muted } = readLocal()
        return { status, posMs, durMs, vol, muted }
    }
    if (pb && pb.requestId === np.id) {
        const live = speakerOnline() && pb.status === "playing"
        let pos = pb.positionMs + (live ? serverNow() - pb.updatedAt : 0)
        if (pb.durationMs) pos = Math.min(pos, pb.durationMs)
        return { ...base, status: pb.status, posMs: Math.max(0, pos), durMs: pb.durationMs }
    }
    return { ...base, status: "loading", posMs: 0, durMs: 0 }
}

// speaker engine 
const eng = {
    on: false, yt: null, ready: false,
    loadedId: null, loadedAt: 0, everPlayed: false,
    desired: "playing",
    view: null, startFrom: null,
    lastExecAt: 0, lastPos: 0, lastPosAt: 0,
    endedSent: false, retried: false,
    gestureTimer: 0, pollTimer: 0, beatTimer: 0, reportTimer: 0,
    reportBusy: false, reportDirty: false, pendingLocal: null,
    wake: null,
}

const mapStatus = (st) => {
    if (!eng.loadedId) return "idle"
    if (st === ST.PLAYING) return "playing"
    if (st === ST.BUFFERING) return "buffering"
    if (st === ST.UNSTARTED) return eng.desired === "playing" ? "loading" : "paused"
    return "paused"
}

const readLocal = () => {
    const y = eng.yt
    const st = y.getPlayerState()
    return {
        st,
        status: mapStatus(st),
        posMs: Math.round((y.getCurrentTime() || 0) * 1000),
        durMs: Math.round((y.getDuration() || 0) * 1000),
        vol: Math.round(y.getVolume()),
        muted: !!y.isMuted(),
    }
}

async function startEngine() {
    if (eng.on) return
    eng.on = true
    pl.speaker = true

    const pb = pl.pb
    eng.startFrom = pb && pb.requestId ? { requestId: pb.requestId, status: pb.status, posMs: pb.positionMs + (speakerOnline() && pb.status === "playing" ? serverNow() - pb.updatedAt : 0) } : null
    emit()

    let YT
    try { YT = await loadYT() }
    catch {
        showToast("โหลดตัวเล่น YouTube ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตของเครื่องนี้", "error")
        stopBeingSpeaker()
        return
    }
    if (!eng.on) return

    const box = document.getElementById("yt-box")
    box.innerHTML = '<div id="yt-slot"></div>'
    eng.yt = new YT.Player("yt-slot", {
        width: "100%", height: "100%",
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, origin: location.origin },
        events: {
            onReady: onReady,
            onStateChange: onStateChange,
            onError: onError,
            onAutoplayBlocked: () => setNeedsGesture(true),
        },
    })
}

function onReady() {
    eng.ready = true
    const y = eng.yt
    const saved = store.get(KEYS.speakerVol)
    const vol = saved !== null && saved !== "" ? Number(saved) : pl.pb ? pl.pb.volume : 100
    y.setVolume(Math.max(0, Math.min(100, Number.isFinite(vol) ? vol : 100)))
    if (pl.pb && pl.pb.muted) y.mute()

    eng.pollTimer = setInterval(poll, POLL_MS)
    eng.beatTimer = setInterval(() => queueReport(), HEARTBEAT_MS)
    lockScreen()
    syncTrack()
    queueReport()
    emit()
}

export function stopEngine() {
    if (!pl.speaker && !eng.on) return
    pl.speaker = false
    eng.on = false
    eng.ready = false
    clearInterval(eng.pollTimer); clearInterval(eng.beatTimer)
    clearTimeout(eng.gestureTimer); clearTimeout(eng.reportTimer)
    eng.reportTimer = 0
    setNeedsGesture(false)
    unlockScreen()
    try { eng.yt && eng.yt.destroy() } catch { /* already gone */ }
    eng.yt = null; eng.loadedId = null; eng.view = null; eng.startFrom = null
    const box = document.getElementById("yt-box")
    if (box) box.innerHTML = ""
    emit()
}

function syncTrack() {
    if (!eng.on || !eng.ready) return
    const np = pl.np
    if (!np) {
        if (eng.loadedId) { try { eng.yt.stopVideo() } catch { /* ignore */ } }
        eng.loadedId = null; eng.view = null
        setNeedsGesture(false)
        queueReport()
        return
    }
    if (np.id === eng.loadedId) return

    let startMs = 0, autoplay = true
    const f = eng.startFrom
    eng.startFrom = null
    if (f && f.requestId === np.id) { startMs = Math.max(0, f.posMs); autoplay = f.status !== "paused" }
    loadTrack(np, startMs, autoplay)
}

function loadTrack(np, startMs, autoplay) {
    Object.assign(eng, {
        loadedId: np.id, loadedAt: Date.now(), everPlayed: false,
        endedSent: false, retried: false, desired: autoplay ? "playing" : "paused",
        lastPos: startMs, lastPosAt: Date.now(),
    })
    const arg = { videoId: np.youtubeId, startSeconds: startMs / 1000 }
    if (autoplay) { eng.yt.loadVideoById(arg); armGestureWatch() }
    else eng.yt.cueVideoById(arg)

    const cur = readLocal()
    eng.view = { status: autoplay ? "loading" : "paused", posMs: startMs, durMs: 0, vol: cur.vol, muted: cur.muted }
    queueReport()
    emit()
}

// autoplay policy
function armGestureWatch() {
    clearTimeout(eng.gestureTimer)
    const id = eng.loadedId
    eng.gestureTimer = setTimeout(() => {
        if (!eng.on || eng.loadedId !== id || eng.desired !== "playing") return
        const st = eng.yt.getPlayerState()
        if (st !== ST.PLAYING && st !== ST.BUFFERING) setNeedsGesture(true)
    }, BLOCKED_AFTER_MS)
}

function unlock() {
    setNeedsGesture(false)
    if (eng.on && eng.ready && eng.desired === "playing") eng.yt.playVideo()
}

function setNeedsGesture(v) {
    if (pl.needsGesture === v) return
    pl.needsGesture = v
    const fn = v ? "addEventListener" : "removeEventListener"
    document[fn]("pointerdown", unlock, true)
    document[fn]("keydown", unlock, true)
    if (eng.on) queueReport()
    emit()
}

// yt events
function onStateChange(e) {
    if (!eng.on || !eng.loadedId) return
    const st = e.data
    let local = null

    if (st === ST.PLAYING) {
        eng.everPlayed = true
        clearTimeout(eng.gestureTimer)
        setNeedsGesture(false)
        if (eng.desired === "paused") { eng.desired = "playing"; local = "play" } // media key / someone at the pc
    } else if (st === ST.PAUSED) {
        const blocked = !eng.everPlayed && Date.now() - eng.loadedAt < BLOCKED_AFTER_MS + 1000
        const atEnd = eng.yt.getDuration() && eng.yt.getDuration() - eng.yt.getCurrentTime() < 1
        if (blocked) setNeedsGesture(true)
        else if (!atEnd && eng.desired === "playing") { eng.desired = "paused"; local = "pause" }
    } else if (st === ST.ENDED) onEnded()

    queueReport(local)
}

function onError(e) {
    const code = e.data
    if (!eng.loadedId) return
    if (code === 5 && !eng.retried) {
        eng.retried = true
        eng.yt.loadVideoById({ videoId: eng.yt.getVideoData().video_id, startSeconds: eng.lastPos / 1000 })
        return
    }
    const id = eng.loadedId
    showToast("เพลงนี้เปิดไม่ได้ ข้ามไปเพลงถัดไปให้แล้ว", "error")
    retryPost("/api/admin/player/failed", () => ({ requestId: id, code: YT_FATAL.includes(code) ? code : 0 }), id)
}

function onEnded() {
    if (eng.endedSent) return
    eng.endedSent = true
    const id = eng.loadedId
    retryPost("/api/admin/player/ended", () => ({ requestId: id }), id)
}

async function retryPost(path, body, id) {
    for (let i = 0; i < 100; i++) {
        if (!eng.on || eng.loadedId !== id) return
        try { await api.post(path, body()); return }
        catch (err) { if (err.status === 401) return showToast("หมดเวลาเข้าสู่ระบบ เพลงจะไม่เปลี่ยนจนกว่าจะเข้าสู่ระบบใหม่", "error") }
        await new Promise((r) => setTimeout(r, 3000))
    }
}

function poll() {
    if (!eng.on || !eng.ready) return
    const v = readLocal()
    const now = Date.now()
    let local = null

    if (eng.loadedId && v.st === ST.PLAYING && eng.lastPosAt && now - eng.lastPosAt < 1500) {
        const expected = eng.lastPos + (now - eng.lastPosAt)
        if (Math.abs(v.posMs - expected) > SEEK_JUMP_MS && now - eng.lastExecAt > 2000) local = "seek"
    }
    eng.lastPos = v.posMs
    eng.lastPosAt = now

    if (eng.loadedId) eng.view = { status: v.status, posMs: v.posMs, durMs: v.durMs, vol: v.vol, muted: v.muted }
    if (local) queueReport(local)
}

// reporting
function queueReport(local = null) {
    if (!eng.on) return
    if (local) eng.pendingLocal = local
    if (eng.reportTimer) return
    eng.reportTimer = setTimeout(sendReport, 60)
}

async function sendReport() {
    eng.reportTimer = 0
    if (!eng.on || !eng.ready) return
    if (eng.reportBusy) { eng.reportDirty = true; return }
    eng.reportBusy = true

    const v = readLocal()
    const local = eng.pendingLocal
    eng.pendingLocal = null
    try {
        await api.post("/api/admin/player/report", {
            clientId, requestId: eng.loadedId, status: v.status,
            positionMs: v.posMs, durationMs: v.durMs, volume: v.vol, muted: v.muted,
            needsGesture: pl.needsGesture, local,
        })
    } catch (err) {
        if (err.code === "not_player") stopEngine()
        else if (local) eng.pendingLocal = local
    } finally {
        eng.reportBusy = false
        if (eng.reportDirty) { eng.reportDirty = false; queueReport() }
    }
}

// commands
function exec({ type, value }) {
    if (!eng.on || !eng.ready) return
    const y = eng.yt
    eng.lastExecAt = Date.now()

    if (type === "play") { eng.desired = "playing"; if (eng.loadedId) y.playVideo() }
    else if (type === "pause") { eng.desired = "paused"; if (eng.loadedId) y.pauseVideo() }
    else if (type === "seek" && eng.loadedId) {
        const dur = (y.getDuration() || 0) * 1000
        const ms = Math.max(0, dur ? Math.min(value, dur - 500) : value)
        y.seekTo(ms / 1000, true)
        eng.lastPos = ms; eng.lastPosAt = Date.now()
    } else if (type === "volume") {
        y.setVolume(value)
        if (value > 0 && y.isMuted()) y.unMute()
        store.set(KEYS.speakerVol, String(value))
    } else if (type === "mute") { if (value) y.mute(); else y.unMute() }

    queueReport()
}

export function onCmd(msg) { if (pl.speaker) exec(msg) }
export async function control(type, value) {
    if (pl.speaker && eng.ready) {
        exec({ type, value })
        queueReport(type)
        emit()
        return true
    }

    try {
        await api.post("/api/admin/player/cmd", { clientId, type, value, by: LABEL })
        return true
    } catch (err) {
        showToast(err.code === "no_player"
            ? 'ไม่มีเครื่องเปิดเพลงที่ออนไลน์ กด "ใช้เครื่องนี้เป็นลำโพง" ก่อน'
            : err.status === 401 ? "หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่" : "สั่งงานไม่สำเร็จ ลองอีกครั้ง", "error")
        return false
    }
}

export const nextSong = () => act(() => post("/api/admin/player/next"))
export const prevSong = () => act(() => post("/api/admin/player/prev"), "ไม่มีเพลงก่อนหน้า")

// speaker role
let autoTried = false
export const resetAutoClaim = () => { autoTried = false }

async function claim(force) {
    pl.claiming = true
    try {
        const r = await api.post("/api/admin/player/claim", { clientId, label: LABEL, force })
        store.set(KEYS.speakerPref, "1")
        onPlayback(r.playback)
        return true
    } catch (err) {
        if (err.code === "player_taken") showToast("มีเครื่องอื่นเพิ่งเป็นลำโพงตัดหน้า ลองใหม่อีกครั้ง", "error")
        else showToast("ตั้งเป็นลำโพงไม่สำเร็จ ลองอีกครั้ง", "error")
        return false
    } finally { pl.claiming = false }
}

export async function becomeSpeaker() {
    if (pl.speaker || pl.claiming) return
    const cur = pl.pb
    const takeover = !!cur && !!cur.playerId && cur.playerId !== clientId && speakerOnline()
    if (takeover) {
        const ok = await confirm({
            title: "ย้ายลำโพงมาที่เครื่องนี้?",
            bodyHtml: `<p>ตอนนี้ <strong>${esc(cur.playerLabel || "เครื่องอื่น")}</strong> เป็นเครื่องเปิดเพลงอยู่ ถ้าย้ายมา เสียงจะออกที่เครื่องนี้แทน และเล่นต่อจากตำแหน่งเดิม</p>`,
            confirmLabel: "ย้ายมาที่นี่",
        })
        if (!ok) return
    }
    await claim(takeover)
}

export async function stopBeingSpeaker() {
    store.set(KEYS.speakerPref, "")
    pl.releasing = true
    stopEngine()
    try { await api.post("/api/admin/player/release", { clientId }) }
    catch { /* expires */ }
    pl.releasing = false
}

function maybeAutoClaim() {
    if (autoTried || pl.speaker || pl.claiming || pl.releasing || !pl.pb || !store.get(KEYS.speakerPref)) return
    autoTried = true
    const { playerId } = pl.pb
    if (playerId === clientId) return
    if (playerId && speakerOnline()) return store.set(KEYS.speakerPref, "")
    claim(false)
}

let actionAt = null
const VERB = { pause: "หยุดเพลง", play: "เล่นเพลง" }

function toastAction(a) {
    const seen = actionAt
    actionAt = a ? a.at : actionAt
    if (!a || seen === null || a.at <= seen || a.byId === clientId) return

    if (a.what === "claim") showToast(`ลำโพงย้ายไปที่ ${a.by}`)
    else if (a.what === "release") showToast(`${a.by} เลิกเป็นลำโพงแล้ว`)
    else if (VERB[a.what]) showToast(a.local ? `ที่เครื่องลำโพง (${a.by}) มีคนกด${VERB[a.what]}` : `${a.by} สั่ง${VERB[a.what]}`)
}

export function onPlayback(pb) {
    pl.pb = pb
    pl.skew = pb.serverTime - Date.now()
    toastAction(pb.lastAction)

    const mine = pb.playerId === clientId
    if (mine && !pl.speaker && !pl.releasing) startEngine()
    else if (!mine && pl.speaker) {
        stopEngine()
        if (pb.playerId) store.set(KEYS.speakerPref, "")
    }
    maybeAutoClaim()
    emit()
}

export function onSnapshot(snap) {
    pl.snap = snap
    pl.np = snap.nowPlaying
    if (pl.speaker) syncTrack()
    emit()
}

async function lockScreen() {
    try {
        if (eng.wake || !navigator.wakeLock) return
        eng.wake = await navigator.wakeLock.request("screen")
        eng.wake.addEventListener("release", () => { eng.wake = null })
    } catch { }
}
function unlockScreen() {
    try { eng.wake && eng.wake.release() } catch { /* ignore */ }
    eng.wake = null
}
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && eng.on && !eng.wake)
        lockScreen()
})
