import { KEYS, store } from "../core/store.js"
const ACTIVE = ["queued", "playing", "played"]

const getDeviceId = () => {
    let id = store.get(KEYS.device)
    if (!id) {
        id = "dev_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20)
        store.set(KEYS.device, id)
    }
    return id
}

export const state = {
    deviceId: getDeviceId(),
    snapshot: null,
    mine: [],
    highlightId: null,
    open: false,
}

const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())

export const onChange = (fn) => listeners.add(fn)
export const setSnapshot = (s) => {
    const cur = state.snapshot
    if (cur && cur.session.id === s.session.id && s.version < cur.version) return // out-of-order
    state.snapshot = s
    emit()
}
export const setMine = (m) => { state.mine = m; emit() }
export const setHighlight = (id) => { state.highlightId = id; emit() }

// selector
export const usedQuota = () => state.mine.filter((r) => !r.quotaExempt && ACTIVE.includes(r.status)).length
export const capOf = () => (state.snapshot ? state.snapshot.session.requestCap : null)
export const capReached = () => capOf() !== null && usedQuota() >= capOf()
export const myIds = () => new Set(state.mine.map((r) => r.id))
export const duplicateOf = (id) => {
    const s = state.snapshot
    if (!s || !id) return null
    if (s.nowPlaying && s.nowPlaying.youtubeId === id) return "เพลงนี้กำลังเปิดอยู่ตอนนี้"
    if (s.queue.some((q) => q.youtubeId === id)) return "เพลงนี้อยู่ในคิวแล้ว ลองเพลงอื่นดูนะ"
    if (s.played.some((p) => p.youtubeId === id)) return "เพลงนี้เพิ่งเปิดไปแล้ว ลองเพลงอื่นดูนะ"
    return null
}

export const queuePos = (id) => {
    if (!state.snapshot) return null
    const idx = state.snapshot.queue.findIndex((q) => q.id === id)
    return idx === -1 ? null : idx
}
