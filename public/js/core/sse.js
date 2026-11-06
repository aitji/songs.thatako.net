import { API_BASE } from "./config.js"
import { api } from "./api.js"

const RETRY_MIN = 1000
const RETRY_MAX = 15000
export function connectEvents(onState, hooks = {}, query = {}) {
    let es = null
    let retryDelay = RETRY_MIN
    let retryTimer = 0
    let warned = false
    let closed = false

    const qs = new URLSearchParams(query).toString()
    const url = `${API_BASE}/api/events${qs ? "?" + qs : ""}`

    function connect() {
        es = new EventSource(url, { withCredentials: true })

        es.addEventListener("state", (ev) => {
            retryDelay = RETRY_MIN
            if (warned) {
                warned = false
                hooks.onReconnected?.()
            }
            try { onState(JSON.parse(ev.data)) }
            catch (e) { console.error("bad state event", e) }
        })

        for (const [name, fn] of Object.entries(hooks.events || {})) {
            es.addEventListener(name, (ev) => {
                try { fn(JSON.parse(ev.data)) }
                catch (e) { console.error(`bad ${name} event`, e) }
            })
        }

        es.onerror = () => {
            if (closed) return
            es.close()
            if (!warned) {
                warned = true
                hooks.onDisconnected?.()
            }
            api.get("/api/state").then(onState).catch(() => { }) // poll while down
            retryTimer = setTimeout(connect, retryDelay)
            retryDelay = Math.min(retryDelay * 2, RETRY_MAX)
        }
    }

    connect()

    const close = () => {
        closed = true
        clearTimeout(retryTimer)
        es?.close()
    }
    close.reconnect = () => {
        if (closed) return
        clearTimeout(retryTimer)
        es?.close()
        retryDelay = RETRY_MIN
        connect()
    }
    return close
}
