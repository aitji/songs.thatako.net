(function () {
    const { escapeHtml: esc, icon } = window.fmt
    let modalRoot = null
    let toastRoot = null
    let pendingResolve = null
    let lastFocus = null

    const ensureModalRoot = () => {
        if (modalRoot) return modalRoot
        modalRoot = document.createElement("div")
        modalRoot.id = "ui-modal-root"
        document.body.appendChild(modalRoot)
        return modalRoot
    }
    const ensureToastRoot = () => {
        if (toastRoot) return toastRoot
        toastRoot = document.createElement("div")
        toastRoot.id = "ui-toast-root"
        toastRoot.setAttribute("aria-live", "polite")
        document.body.appendChild(toastRoot)
        return toastRoot
    }

    function onKeydown(e) {
        if (e.key === "Escape") return closeModal(null)
        if (e.key !== "Tab") return
        const box = ensureModalRoot().querySelector(".modal-box")
        if (!box) return
        const items = [...box.querySelectorAll("button, a[href], input, textarea")].filter((el) => !el.disabled && el.offsetParent !== null)
        if (!items.length) return
        const first = items[0], last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    function closeModal(result) {
        const root = ensureModalRoot()
        root.innerHTML = ""
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

    const showWhenAttrs = (f) => f.showWhen
        ? ` data-show-field="${esc(f.showWhen.id)}" data-show-value="${esc(f.showWhen.value)}"`
        : ""

    const fieldHtml = (f) => {
        const id = `modal-field-${esc(f.id)}`
        if (f.type === "radio") {
            const opts = (f.options || []).map((o) => `
                <label class="radio-option">
                    <input type="radio" name="${id}" value="${esc(o.value)}" ${o.value === f.default ? "checked" : ""} />
                    <span class="radio-text"><span class="radio-label">${esc(o.label)}</span>${o.desc ? `<span class="radio-desc">${esc(o.desc)}</span>` : ""}</span>
                </label>`).join("")
            return `<div class="field-group"${showWhenAttrs(f)}>
                ${f.label ? `<div class="field-label">${esc(f.label)}</div>` : ""}<div class="radio-group">${opts}</div></div>`
        }
        const max = f.maxlength ? ` maxlength="${f.maxlength}"` : ""
        const common = `id="${id}" placeholder="${esc(f.placeholder || "")}"${max} autocomplete="off"`
        const control = f.type === "textarea"
            ? `<textarea ${common} rows="${f.rows || 3}">${esc(f.default || "")}</textarea>`
            : `<input type="text" ${common} value="${esc(f.default || "")}" />`
        const counter = f.maxlength ? `<span class="counter" data-counter-for="${id}"></span>` : ""
        return `<div class="field-group"${showWhenAttrs(f)}>
            <label for="${id}"><span>${esc(f.label)}</span>${counter}</label>${control}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}</div>`
    }

    function openModal({ title, headerHtml = "", bodyHtml, bodyText = "", fields = [], actions = [], secondary = [] }) {
        const body = bodyHtml ?? bodyText
        return new Promise((resolve) => {
            if (pendingResolve) pendingResolve(null)
            pendingResolve = resolve
            lastFocus = document.activeElement
            const root = ensureModalRoot()

            const btn = (a, i, kind) => a.href
                ? `<a data-${kind}="${i}" class="btn ${esc(a.variant || "")}" href="${esc(a.href)}" target="_blank" rel="noopener noreferrer">${esc(a.label)}</a>`
                : `<button type="button" data-${kind}="${i}"${a.follow ? " data-follow" : ""} class="btn ${esc(a.variant || "")}">${esc(a.label)}</button>`

            root.innerHTML = `
            <div class="modal-backdrop">
                <div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                    <div class="modal-grabber" aria-hidden="true"></div>
                    <div class="modal-title">${esc(title)}</div>
                    ${headerHtml ? `<div class="modal-header">${headerHtml}</div>` : ""}
                    ${body ? `<div class="modal-body">${body}</div>` : ""}
                    ${fields.map(fieldHtml).join("")}
                    <div class="modal-actions">${actions.map((a, i) => btn(a, i, "idx")).join("")}</div>
                    ${secondary.length ? `<div class="modal-secondary">${secondary.map((a, i) => btn(a, i, "sec")).join("")}</div>` : ""}
                </div>
            </div>`
            document.body.classList.add("modal-open")
            document.addEventListener("keydown", onKeydown)

            const getValues = () => {
                const values = {}
                fields.forEach((f) => {
                    if (f.type === "radio") {
                        const c = root.querySelector(`input[name="modal-field-${CSS.escape(f.id)}"]:checked`)
                        values[f.id] = c ? c.value : ""
                    } else {
                        const el = document.getElementById(`modal-field-${f.id}`)
                        values[f.id] = el ? el.value.trim() : ""
                    }
                })
                return values
            }

            const followBtn = root.querySelector("[data-follow]")
            const sync = () => {
                const v = getValues()
                root.querySelectorAll("[data-show-field]").forEach((el) => {
                    el.hidden = v[el.dataset.showField] !== el.dataset.showValue
                })
                if (!followBtn) return
                fields.forEach((f) => {
                    if (f.type !== "radio") return
                    const o = (f.options || []).find((x) => x.value === v[f.id])
                    if (o && o.actionLabel) {
                        followBtn.textContent = o.actionLabel
                        followBtn.classList.toggle("danger-solid", !!o.danger)
                        followBtn.classList.toggle("ink", !o.danger)
                    }
                })
            }
            root.querySelectorAll("[data-counter-for]").forEach((c) => {
                const el = document.getElementById(c.dataset.counterFor)
                const upd = () => { c.textContent = `${el.value.length}/${el.maxLength}` }
                el.addEventListener("input", upd); upd()
            })
            root.addEventListener("change", sync)
            sync()

            root.querySelector(".modal-backdrop").addEventListener("click", (e) => {
                if (e.target.classList.contains("modal-backdrop")) closeModal(null)
            })
            const wire = (list, kind) => list.forEach((a, i) => {
                const el = root.querySelector(`[data-${kind}="${i}"]`)
                if (!el) return
                el.addEventListener("click", () => closeModal({ action: a.value, values: a.href ? {} : getValues() }))
            })
            wire(actions, "idx")
            wire(secondary, "sec")

            const first = root.querySelector("input[type=text], textarea")
            const primary = root.querySelector(".btn.primary, .btn.danger-solid")
            ;(first || primary || root.querySelector(".btn"))?.focus({ preventScroll: true })
        })
    }

    const openInfoModal = (title, bodyHtml) =>
        openModal({ title, bodyHtml, actions: [{ label: "เข้าใจแล้ว", value: "ok", variant: "primary" }] })

    const confirm = async ({ title, bodyHtml, confirmLabel = "ตกลง", cancelLabel = "ยกเลิก", danger = false }) => {
        const res = await openModal({
            title, bodyHtml,
            actions: [
                { label: cancelLabel, value: "cancel" },
                { label: confirmLabel, value: "confirm", variant: danger ? "danger-solid" : "primary" },
            ],
        })
        return !!res && res.action === "confirm"
    }

    const confirmLeave = ({ youtubeId, title }) => openModal({
        title: "ไปดูที่ YouTube?",
        bodyHtml: `<p>${title ? `"${esc(title)}" ` : "เพลงนี้ "}จะเปิดที่ YouTube ในแท็บใหม่ หน้านี้ยังอยู่ที่เดิม</p>`,
        actions: [
            { label: "อยู่ที่นี่", value: "stay" },
            { label: "เปิด YouTube", value: "go", variant: "primary", href: window.fmt.watchUrl(youtubeId) },
        ],
    })

    function showToast(message, type = "default") {
        const root = ensureToastRoot()
        const el = document.createElement("div")
        el.className = `toast${type === "error" ? " toast-error" : ""}`
        el.textContent = message
        root.appendChild(el)
        requestAnimationFrame(() => el.classList.add("show"))
        setTimeout(() => {
            el.classList.remove("show")
            setTimeout(() => el.remove(), 180)
        }, type === "error" ? 4200 : 2600)
    }

    window.ui = { openModal, openInfoModal, confirm, confirmLeave, showToast, icon }
})()
