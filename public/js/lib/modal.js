import { esc } from "./dom.js"
import { watchUrl } from "./youtube.js"
import { bindFields, fieldHtml, readValues } from "./modalFields.js"

let root = null
let pendingResolve = null
let lastFocus = null

const ensureRoot = () => {
    if (root) return root
    root = document.createElement("div")
    root.id = "ui-modal-root"
    document.body.appendChild(root)
    return root
}

function onKeydown(e) {
    if (e.key === "Escape") return closeModal(null)
    if (e.key !== "Tab") return
    const box = ensureRoot().querySelector(".modal-box")
    if (!box) return
    const items = [...box.querySelectorAll("button, a[href], input, textarea")].filter((el) => !el.disabled && el.offsetParent !== null)
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

function closeModal(result) {
    ensureRoot().innerHTML = ""
    document.body.classList.remove("modal-open")
    document.removeEventListener("keydown", onKeydown)
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true })
    lastFocus = null
    if (pendingResolve) {
        const resolve = pendingResolve
        pendingResolve = null
        resolve(result)
    }
}

const btnHtml = (a, i, kind) => a.href
    ? `<a data-${kind}="${i}" class="btn ${esc(a.variant || "")}" href="${esc(a.href)}" target="_blank" rel="noopener noreferrer">${esc(a.label)}</a>`
    : `<button type="button" data-${kind}="${i}"${a.follow ? " data-follow" : ""} class="btn ${esc(a.variant || "")}">${esc(a.label)}</button>`

export function openModal({ title, headerHtml = "", bodyHtml, bodyText = "", fields = [], actions = [], secondary = [] }) {
    const body = bodyHtml ?? bodyText
    return new Promise((resolve) => {
        if (pendingResolve) pendingResolve(null)
        pendingResolve = resolve
        lastFocus = document.activeElement
        const el = ensureRoot()

        el.innerHTML = `
        <div class="modal-backdrop">
            <div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="modal-grabber" aria-hidden="true"></div>
                <div class="modal-title">${esc(title)}</div>
                ${headerHtml ? `<div class="modal-header">${headerHtml}</div>` : ""}
                ${body ? `<div class="modal-body">${body}</div>` : ""}
                ${fields.map(fieldHtml).join("")}
                <div class="modal-actions">${actions.map((a, i) => btnHtml(a, i, "idx")).join("")}</div>
                ${secondary.length ? `<div class="modal-secondary">${secondary.map((a, i) => btnHtml(a, i, "sec")).join("")}</div>` : ""}
            </div>
        </div>`
        document.body.classList.add("modal-open")
        document.addEventListener("keydown", onKeydown)

        bindFields(el, fields)
        el.querySelector(".modal-backdrop").addEventListener("click", (e) => {
            if (e.target.classList.contains("modal-backdrop")) closeModal(null)
        })

        const wire = (list, kind) => list.forEach((a, i) => {
            const btn = el.querySelector(`[data-${kind}="${i}"]`)
            if (btn) btn.addEventListener("click", () => closeModal({ action: a.value, values: a.href ? {} : readValues(el, fields) }))
        })
        wire(actions, "idx")
        wire(secondary, "sec")
    })
}

export const openInfoModal = (title, bodyHtml) =>
    openModal({ title, bodyHtml, actions: [{ label: "เข้าใจแล้ว", value: "ok", variant: "primary" }] })

export const confirm = async ({ title, bodyHtml, confirmLabel = "ตกลง", cancelLabel = "ยกเลิก", danger = false }) => {
    const res = await openModal({
        title, bodyHtml,
        actions: [
            { label: cancelLabel, value: "cancel" },
            { label: confirmLabel, value: "confirm", variant: danger ? "danger-solid" : "primary" },
        ],
    })
    return !!res && res.action === "confirm"
}

export const confirmLeave = ({ youtubeId, title }) => openModal({
    title: "ไปดูที่ YouTube?",
    bodyHtml: `<p>${title ? `"${esc(title)}" ` : "เพลงนี้ "}จะเปิดที่ YouTube ในแท็บใหม่ หน้านี้ยังอยู่ที่เดิม</p>`,
    actions: [
        { label: "อยู่ที่นี่", value: "stay" },
        { label: "เปิด YouTube", value: "go", variant: "primary", href: watchUrl(youtubeId) },
    ],
})
export const modalBody = () => document.querySelector("#ui-modal-root .modal-body")
