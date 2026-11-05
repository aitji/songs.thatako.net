import { KEYS, store } from "./store.js"

export const MODES = ["client", "light", "dark"]

const META_COLOR = { light: "#ffffff", dark: "#171a20" }
const root = document.documentElement
const media = matchMedia("(prefers-color-scheme: dark)")
const bus = new EventTarget()

const saved = store.get(KEYS.theme)
let mode = MODES.includes(saved) ? saved : "client"

export const getMode = () => mode
export const resolvedTheme = () => (mode === "client" ? (media.matches ? "dark" : "light") : mode)

// attr (css)
function apply() {
    if (mode === "client") delete root.dataset.theme
    else root.dataset.theme = mode

    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        if (m.dataset.html === undefined) m.dataset.html = m.content // html default
        m.content = mode === "client" ? m.dataset.html : META_COLOR[mode]
    })
    bus.dispatchEvent(new CustomEvent("change", { detail: { mode, theme: resolvedTheme() } }))
}

export const setMode = (next) => {
    if (!MODES.includes(next)) return
    mode = next
    store.set(KEYS.theme, next)
    apply()
}

export const onThemeChange = (fn) => {
    const h = (e) => fn(e.detail)
    bus.addEventListener("change", h)
    return () => bus.removeEventListener("change", h)
}

const onMedia = () => { if (mode === "client") apply() }
if (media.addEventListener) media.addEventListener("change", onMedia)
else media.addListener(onMedia) // old safari

apply()
