let root = null

const ensureRoot = () => {
    if (root) return root
    root = document.createElement("div")
    root.id = "ui-toast-root"
    root.setAttribute("aria-live", "polite")
    document.body.appendChild(root)
    return root
}

export function showToast(message, type = "default") {
    const el = document.createElement("div")
    el.className = `toast${type === "error" ? " toast-error" : ""}`
    el.textContent = message
    ensureRoot().appendChild(el)

    requestAnimationFrame(() => el.classList.add("show"))
    setTimeout(() => {
        el.classList.remove("show")
        setTimeout(() => el.remove(), 180)
    }, type === "error" ? 4200 : 2600)
}
