import { icon } from "./icons.js"
import { esc } from "./dom.js"
import { parseYouTube } from "./youtube.js"

const ERR_DELAY = 650
export function createUrlField({ input, msg, hint = "", verdict = () => null, onRender = () => { }, onChange = () => { } }) {
    let parsed = { kind: "empty" }
    let timer = null

    const say = (tone, iconName, text) => {
        msg.className = `field-msg ${tone}`
        msg.innerHTML = text ? `${iconName ? icon(iconName, 16) : ""}<span>${esc(text)}</span>` : ""
    }

    function render(p = parsed) {
        input.classList.remove("is-error", "is-ok")
        let v = null
        if (p.kind === "ok") {
            v = verdict(p)
            if (v) { input.classList.add("is-error"); say("err", "alert", v) }
            else { input.classList.add("is-ok"); say("ok", "okc", "ลิงก์ถูกต้อง") }
        } else if (p.kind === "error") {
            input.classList.add("is-error")
            say("err", "alert", p.reason)
        } else say("", "", p.kind === "pending" ? "" : hint)
        onRender(p, v)
    }

    function update(immediate) {
        parsed = parseYouTube(input.value)
        clearTimeout(timer)
        if (parsed.kind === "error" && !immediate) {
            render({ kind: "pending" })
            timer = setTimeout(() => render(), ERR_DELAY)
        } else render()
        onChange(parsed)
    }

    input.addEventListener("input", () => update(false))
    input.addEventListener("paste", () => setTimeout(() => update(true), 0))
    input.addEventListener("blur", () => update(true))
    render()

    return {
        parsed: () => parsed,
        render: () => render(),
        refresh: (immediate = true) => update(immediate),
        clear() { input.value = ""; parsed = { kind: "empty" }; clearTimeout(timer); render() },
        fail(text) { input.classList.add("is-error"); say("err", "alert", text) },
    }
}
