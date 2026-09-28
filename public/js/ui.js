(function () {
    let modalRoot = null
    let toastRoot = null

    const escapeHtml = (str) => {
        const d = document.createElement("div")
        d.textContent = str == null ? "" : String(str)
        return d.innerHTML
    }

    function ensureModalRoot() {
        if (modalRoot) return modalRoot
        modalRoot = document.createElement("div")
        modalRoot.id = "ui-modal-root"
        document.body.appendChild(modalRoot)
        return modalRoot
    }

    function ensureToastRoot() {
        if (toastRoot) return toastRoot
        toastRoot = document.createElement("div")
        toastRoot.id = "ui-toast-root"
        document.body.appendChild(toastRoot)
        return toastRoot
    }

    function onKeydown(e) {
        if (e.key === "Escape") closeModal(null)
        // more key
    }

    let pendingResolve = null
    function closeModal(result) {
        const root = ensureModalRoot()
        root.innerHTML = ""
        document.removeEventListener("keydown", onKeydown)
        if (pendingResolve) {
            const resolve = pendingResolve
            pendingResolve = null
            resolve(result)
        }
    }

    function openModal({ title, bodyText = "", fields = [], actions }) {
        return new Promise((resolve) => {
            pendingResolve = resolve
            const root = ensureModalRoot()

            const fieldsHtml = fields
                .map((f) => {
                    if (f.type === "radio") {
                        const opts = (f.options || [])
                            .map((o) => `
                            <label class="radio-option">
                                <input type="radio" name="modal-field-${escapeHtml(f.id)}" value="${escapeHtml(o.value)}" ${o.value === f.default ? "checked" : ""} />
                                <span>${escapeHtml(o.label)}</span>
                            </label>`)
                            .join("")
                        return `
                        <div class="field-group">
                            <label>${escapeHtml(f.label)}</label>
                            <div class="radio-group" id="modal-field-${escapeHtml(f.id)}">${opts}</div>
                        </div>`
                    }
                    return `
                <label for="modal-field-${escapeHtml(f.id)}">${escapeHtml(f.label)}</label>
                <input type="text" id="modal-field-${escapeHtml(f.id)}" placeholder="${escapeHtml(f.placeholder || "")}" value="${escapeHtml(f.default || "")}" />`
                })
                .join("")

            const actionsHtml = actions
                .map((a, i) => `<button type="button" data-idx="${i}" class="${escapeHtml(a.variant || "")}">${escapeHtml(a.label)}</button>`)
                .join("")

            root.innerHTML = `
            <div class="modal-backdrop">
                <div class="modal-box" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                    <div class="modal-title">${escapeHtml(title)}</div>
                        ${bodyText ? `<div class="modal-body">${bodyText}</div>` : ""}
                        ${fieldsHtml}
                    <div class="modal-actions">${actionsHtml}</div>
                </div>
            </div>`

            document.addEventListener("keydown", onKeydown)
            root.querySelector(".modal-backdrop").addEventListener("click", (e) => {
                if (e.target.classList.contains("modal-backdrop"))
                    closeModal(null)
            })

            actions.forEach((a, i) => {
                root.querySelector(`[data-idx="${i}"]`).addEventListener("click", () => {
                    const values = {}
                    fields.forEach((f) => {
                        if (f.type === "radio") {
                            const checked = root.querySelector(`input[name="modal-field-${f.id}"]:checked`)
                            values[f.id] = checked ? checked.value : ""
                            return
                        }
                        const el = document.getElementById(`modal-field-${f.id}`)
                        values[f.id] = el ? el.value : ""
                    })
                    closeModal({ action: a.value, values })
                })
            })

            const first = fields[0]
            if (first && first.type !== "radio") {
                const el = document.getElementById(`modal-field-${first.id}`)
                if (el) el.focus()
            }
        })
    }

    function openInfoModal(title, bodyHtml) {
        return new Promise((resolve) => {
            pendingResolve = resolve
            const root = ensureModalRoot()
            root.innerHTML = `
            <div class="modal-backdrop">
                <div class="modal-box" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                    <div class="modal-title">${escapeHtml(title)}</div>
                    <div class="modal-body">${bodyHtml}</div>
                    <div class="modal-actions">
                        <button type="button" data-idx="0" class="primary">เข้าใจแล้ว</button>
                    </div>
                </div>
            </div>`
            document.addEventListener("keydown", onKeydown)
            root.querySelector(".modal-backdrop").addEventListener("click", (e) => {
                if (e.target.classList.contains("modal-backdrop"))
                    closeModal(null)
            })
            root.querySelector("[data-idx='0']").addEventListener("click", () => closeModal(true))
        })
    }

    function showToast(message, type = "default") {
        const root = ensureToastRoot()
        const el = document.createElement("div")
        el.className = `toast${type === "error" ? " toast-error" : ""}`
        el.textContent = message
        root.appendChild(el)
        requestAnimationFrame(() => el.classList.add("show"))
        setTimeout(() => {
            el.classList.remove("show")
            setTimeout(() => el.remove(), 150)
        }, type === "error" ? 4000 : 2400)
    }

    window.ui = { openModal, openInfoModal, showToast }
})()
