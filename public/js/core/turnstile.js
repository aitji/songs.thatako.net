import { TURNSTILE_SITEKEY } from "./config.js"
import { onThemeChange, resolvedTheme } from "./theme.js"

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
let loading = null

const load = () => {
    if (loading) return loading
    loading = new Promise((resolve, reject) => {
        if (window.turnstile) return resolve(window.turnstile)
        const s = document.createElement("script")
        s.src = SRC
        s.async = true
        s.onload = () => resolve(window.turnstile)
        s.onerror = () => { loading = null; reject(new Error("turnstile_load_failed")) }
        document.head.appendChild(s)
    })
    return loading
}

export function mountTurnstile(el, { action, onToken = () => { } } = {}) {
    let id = null
    let token = ""
    let dead = false

    const setToken = (t) => { token = t; onToken(t) }
    async function render() {
        let ts
        try { ts = await load() }
        catch { el.dataset.state = "error"; return }
        if (dead) return

        if (id !== null) ts.remove(id)
        setToken("")
        delete el.dataset.state
        id = ts.render(el, {
            sitekey: TURNSTILE_SITEKEY,
            action,
            theme: resolvedTheme(),
            size: "flexible",
            language: "th",
            callback: setToken,
            "expired-callback": () => setToken(""),
            "timeout-callback": () => setToken(""),
        })
    }

    const off = onThemeChange(render)
    render()

    return {
        token: () => token,
        reset() {
            setToken("")
            if (id !== null && window.turnstile) window.turnstile.reset(id)
        },
        destroy() {
            dead = true
            off()
            if (id !== null && window.turnstile) window.turnstile.remove(id)
        },
    }
}
