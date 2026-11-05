export const $ = (id) => document.getElementById(id)
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

export const esc = (v) => (v == null ? "" : String(v)).replace(/[&<>"']/g, (c) => ESC[c])
export const delegate = (root, type, selector, fn) => root.addEventListener(type, (e) => {
    const el = e.target.closest(selector)
    if (el && root.contains(el)) fn(el, e)
})

export const spinnerHtml = (text) => `<span class="spinner"></span> ${esc(text)}`
export const bindCounter = (input, el) => {
    const upd = () => { el.textContent = input.value ? `${input.value.length}/${input.maxLength}` : "" }
    input.addEventListener("input", upd)
    upd()
    return upd
}

export const toggleWrap = (btn, wrap, open) => {
    wrap.hidden = !open
    btn.setAttribute("aria-expanded", open ? "true" : "false")
}
