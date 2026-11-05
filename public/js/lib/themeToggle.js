import { cycleMode, getMode, onThemeChange } from "../core/theme.js"
import { icon } from "./icons.js"
import { showToast } from "./toast.js"

const LABEL = { client: "ตามอุปกรณ์", light: "สว่าง", dark: "มืด" }
const ICON = { client: "monitor", light: "sun", dark: "moon" }
export function initThemeToggle() {
    const btns = document.querySelectorAll("[data-theme-toggle]")

    const paint = () => btns.forEach((b) => {
        const mode = getMode()
        const text = `ธีม: ${LABEL[mode]} (แตะเพื่อเปลี่ยน)`
        b.innerHTML = icon(ICON[mode], 18)
        b.title = text
        b.setAttribute("aria-label", text)
    })

    btns.forEach((b) => b.addEventListener("click", () => {
        cycleMode()
        showToast(`ธีม: ${LABEL[getMode()]}`)
    }))
    onThemeChange(paint)
    paint()
}
