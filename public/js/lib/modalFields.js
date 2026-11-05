import { esc } from "./dom.js"

const showWhenAttrs = (f) => f.showWhen
    ? ` data-show-field="${esc(f.showWhen.id)}" data-show-value="${esc(f.showWhen.value)}"`
    : ""

const radioHtml = (f) => {
    const name = `modal-field-${esc(f.id)}`
    const opts = (f.options || []).map((o) => `
        <label class="radio-option">
            <input type="radio" name="${name}" value="${esc(o.value)}" ${o.value === f.default ? "checked" : ""} />
            <span class="radio-text"><span class="radio-label">${esc(o.label)}</span>${o.desc ? `<span class="radio-desc">${esc(o.desc)}</span>` : ""}</span>
        </label>`).join("")
    return `<div class="field-group"${showWhenAttrs(f)}>
        ${f.label ? `<div class="field-label">${esc(f.label)}</div>` : ""}<div class="radio-group">${opts}</div></div>`
}

const textHtml = (f) => {
    const id = `modal-field-${esc(f.id)}`
    const max = f.maxlength ? ` maxlength="${f.maxlength}"` : ""
    const common = `id="${id}" placeholder="${esc(f.placeholder || "")}"${max} autocomplete="off"`
    const control = f.type === "textarea"
        ? `<textarea ${common} rows="${f.rows || 3}">${esc(f.default || "")}</textarea>`
        : `<input type="text" ${common} value="${esc(f.default || "")}" />`
    const counter = f.maxlength ? `<span class="counter" data-counter-for="${id}"></span>` : ""
    return `<div class="field-group"${showWhenAttrs(f)}>
        <label for="${id}"><span>${esc(f.label)}</span>${counter}</label>${control}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ""}</div>`
}

export const fieldHtml = (f) => (f.type === "radio" ? radioHtml(f) : textHtml(f))
export const readValues = (root, fields) => {
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

export const bindFields = (root, fields) => {
    const followBtn = root.querySelector("[data-follow]")

    const sync = () => {
        const v = readValues(root, fields)
        root.querySelectorAll("[data-show-field]").forEach((el) => {
            el.hidden = v[el.dataset.showField] !== el.dataset.showValue
        })
        if (!followBtn) return
        fields.forEach((f) => {
            if (f.type !== "radio") return
            const o = (f.options || []).find((x) => x.value === v[f.id])
            if (!o || !o.actionLabel) return
            followBtn.textContent = o.actionLabel
            followBtn.classList.toggle("danger-solid", !!o.danger)
            followBtn.classList.toggle("ink", !o.danger)
        })
    }

    root.querySelectorAll("[data-counter-for]").forEach((c) => {
        const el = document.getElementById(c.dataset.counterFor)
        const upd = () => { c.textContent = `${el.value.length}/${el.maxLength}` }
        el.addEventListener("input", upd)
        upd()
    })
    root.addEventListener("change", sync)
    sync()
}
