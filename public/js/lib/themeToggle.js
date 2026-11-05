import { getMode, onThemeChange, setMode } from "../core/theme.js"
import { icon } from "./icons.js"
import { openModal } from "./modal.js"

const LABEL = { client: "ตามอุปกรณ์", dark: "มืด", light: "สว่าง" }
const ICON = { client: "monitor", light: "sun", dark: "moon" }
const ORDER = ["client", "dark", "light"]

// radio field
export const themeField = () => ({
    id: "theme",
    type: "radio",
    label: "ธีม",
    default: getMode(),
    options: ORDER.map((value) => ({ value, label: LABEL[value] })),
})
export const applyThemePick = (values) => setMode(values.theme)
export const openThemeModal = () => openModal({
    title: "เลือกธีม",
    fields: [{ ...themeField(), label: "" }],
    actions: [{ label: "เสร็จสิ้น", value: "ok", variant: "primary" }],
    onChange: applyThemePick,
})

export function initThemeToggle() {
    const btns = document.querySelectorAll("[data-theme-toggle]")

    const paint = () => btns.forEach((b) => {
        const mode = getMode()
        const text = `ธีม: ${LABEL[mode]} (แตะเพื่อเลือก)`
        b.innerHTML = icon(ICON[mode], 18)
        b.title = text
        b.setAttribute("aria-label", text)
    })

    btns.forEach((b) => b.addEventListener("click", openThemeModal))
    onThemeChange(paint)
    paint()
}
