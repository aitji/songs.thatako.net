import { $ } from "../lib/dom.js"
import { reorder } from "./actions.js"
import { render } from "./render.js"
import { state } from "./state.js"

const EDGE = 90
const SCROLL_STEP = 14

export function initDrag() {
    const panel = $("admin-queue")

    panel.addEventListener("pointerdown", (e) => {
        const grip = e.target.closest('[data-act="grip"]')
        if (!grip || (e.pointerType === "mouse" && e.button !== 0)) return

        const card = grip.closest(".song")
        const cards = [...panel.querySelectorAll(":scope > .song")]
        const from = cards.indexOf(card)
        if (from === -1 || cards.length < 2) return

        e.preventDefault()
        grip.setPointerCapture(e.pointerId)
        state.dragging = true
        card.classList.add("dragging")

        // page coord
        const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY
        const tops = cards.map(pageTop)
        const mids = cards.map((c, i) => tops[i] + c.offsetHeight / 2)
        const bottoms = cards.map((c, i) => tops[i] + c.offsetHeight)
        const hostTop = pageTop(panel)
        const startY = e.clientY
        const startScroll = window.scrollY

        const line = document.createElement("div")
        line.className = "drop-line"
        line.style.cssText = "position:absolute;left:0;right:0"
        panel.appendChild(line)

        let lastY = e.clientY
        let target = from
        let raf = 0

        const update = () => {
            const dy = lastY - startY + (window.scrollY - startScroll)
            card.style.transform = `translateY(${dy}px)`
            const dragMid = mids[from] + dy
            const others = cards.map((_, i) => i).filter((i) => i !== from)
            target = others.filter((i) => mids[i] < dragMid).length
            const y = target === 0 ? tops[others[0]] : bottoms[others[target - 1]]
            line.style.top = `${y - hostTop - 1}px`
        }

        const tick = () => {
            if (!state.dragging) return
            if (lastY < EDGE) window.scrollBy(0, -SCROLL_STEP)
            else if (lastY > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP)
            update()
            raf = requestAnimationFrame(tick)
        }

        const onMove = (ev) => { lastY = ev.clientY }
        const finish = async (ev) => {
            grip.removeEventListener("pointermove", onMove)
            grip.removeEventListener("pointerup", finish)
            grip.removeEventListener("pointercancel", finish)
            cancelAnimationFrame(raf)
            card.classList.remove("dragging")
            card.style.transform = ""
            line.remove()

            if (ev.type === "pointerup" && target !== from) {
                const ids = cards.map((c) => c.dataset.id)
                ids.splice(target, 0, ids.splice(from, 1)[0])
                await reorder(ids)
            }
            state.dragging = false
            if (state.pending) { const s = state.pending; state.pending = null; render(s) }
        }

        grip.addEventListener("pointermove", onMove)
        grip.addEventListener("pointerup", finish)
        grip.addEventListener("pointercancel", finish)
        raf = requestAnimationFrame(tick)
    })
}
