function connectEvents(onState, hooks = {}, query = {}) {
    let es = null
    let retryDelay = 1000
    let hasWarned = false
    let closedByCaller = false

    const qs = new URLSearchParams(query).toString()
    const url = window.CONFIG.API_BASE + "/api/events" + (qs ? "?" + qs : "")

    function connect() {
        es = new EventSource(url, { withCredentials: true })

        es.addEventListener("state", (ev) => {
            retryDelay = 1000
            if (hasWarned) {
                hasWarned = false
                if (hooks.onReconnected) hooks.onReconnected()
            }

            try { onState(JSON.parse(ev.data)) }
            catch (e) { console.error("bad state event", e) }
        })

        es.onerror = () => {
            if (closedByCaller) return
            es.close()
            if (!hasWarned) {
                hasWarned = true
                if (hooks.onDisconnected) hooks.onDisconnected()
            }
            window.api.get("/api/state").then(onState).catch(() => { })
            setTimeout(connect, retryDelay)
            retryDelay = Math.min(retryDelay * 2, 15000)
        }
    }

    connect()
    return () => {
        closedByCaller = true
        if (es) es.close()
    }
}

window.connectEvents = connectEvents
