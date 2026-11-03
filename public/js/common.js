(function () {
    const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/

    const escapeHtml = (str) => {
        const d = document.createElement("div")
        d.textContent = str == null ? "" : String(str)
        return d.innerHTML
    }

    const watchUrl = (youtubeId) => `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`
    const shortDevice = (deviceId) => (deviceId ? String(deviceId).replace(/^dev_/, "").slice(0, 8) : null)

    const agoText = (epoch) => {
        const sec = Math.max(0, Math.floor((Date.now() - epoch) / 1000))
        if (sec < 60) return "เมื่อสักครู่"
        const min = Math.floor(sec / 60)
        if (min < 60) return `${min} นาทีที่แล้ว`
        return `${Math.floor(min / 60)} ชั่วโมงที่แล้ว`
    }

    const PREFIX = { requested: "ขอเมื่อ", played: "เล่นเมื่อ", plain: "" }
    const agoLabel = (kind, epoch) => {
        const t = agoText(epoch)
        const pre = PREFIX[kind] ?? ""
        if (!pre) return t
        return t === "เมื่อสักครู่" ? `${pre}${t}` : `${pre} ${t}`
    }

    const agoSpan = (epoch, kind = "requested") => `<span data-ago="${epoch}" data-kind="${kind}">${agoLabel(kind, epoch)}</span>`
    const tickAgo = () => document.querySelectorAll("[data-ago]").forEach((el) => {
        const next = agoLabel(el.dataset.kind, Number(el.dataset.ago))
        if (el.textContent !== next) el.textContent = next
    })
    setInterval(tickAgo, 30000)

    const P = {
        play: '<path d="M7 4.500v15l12.500-7.500z" fill="currentColor" stroke-width="1.500"/>',
        eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
        x: '<path d="M6 6l12 12M18 6L6 18"/>',
        up: '<path d="M6 15l6-6 6 6"/>',
        down: '<path d="M6 9l6 6 6-6"/>',
        grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g>',
        pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.500 20.500 2 22l1.500-5.500L17 3z"/>',
        note: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
        skip: '<path d="M5 5l9 7-9 7z" fill="currentColor"/><path d="M19 5v14"/>',
        undo: '<path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
        paste: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.500v5.500"/><circle cx="12" cy="16.500" r=".6" fill="currentColor"/>',
        help: '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.300a2.500 2.500 0 1 1 3.300 2.400c-.9.300-1.300.9-1.300 1.900"/><circle cx="12" cy="16.600" r=".6" fill="currentColor"/>',
        okc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.500l3 3 5-6"/>',
        user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.600 3.100-6 7-6s7 2.400 7 6"/>',
    }
    const icon = (name, size = 18) =>
        `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`

    const hydrateIcons = (root = document) => root.querySelectorAll("[data-icon]").forEach((el) => {
        el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 18)
    })

    const parseYouTube = (raw) => {
        let s = String(raw || "").trim()
        if (!s) return { kind: "empty" }
        if (YT_ID_RE.test(s)) return { kind: "ok", id: s, url: s }

        const found = s.match(/https?:\/\/\S+/i)
        if (found) s = found[0]
        else if (/\s/.test(s)) return { kind: "error", reason: "ลิงก์ต้องไม่มีช่องว่าง ลองวางลิงก์จากปุ่มแชร์ของยูทูบ" }

        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
            if (/^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)(\/|$)/i.test(s)) s = "https://" + s
            else return { kind: "error", reason: "วางลิงก์ยูทูบ เช่น https://youtu.be/..." }
        }

        let u
        try { u = new URL(s) } catch { return { kind: "error", reason: "ลิงก์ยังไม่สมบูรณ์" } }
        const host = u.hostname.replace(/^www\./, "")
        const ok = (id) => (YT_ID_RE.test(id || "") ? { kind: "ok", id, url: s } : null)

        if (host === "youtu.be") {
            return ok(u.pathname.slice(1).split("/")[0]) || { kind: "error", reason: "ลิงก์ youtu.be ยังไม่ครบ ลองคัดลอกใหม่อีกครั้ง" }
        }
        if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
            if (u.pathname === "/watch") {
                return ok(u.searchParams.get("v")) || { kind: "error", reason: "ลิงก์นี้ไม่มีรหัสวิดีโอ ลองคัดลอกใหม่อีกครั้ง" }
            }
            const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/)
            if (m) return { kind: "ok", id: m[1], url: s }
            if (u.pathname === "/playlist") return { kind: "error", reason: "นี่เป็นลิงก์เพลย์ลิสต์ เปิดเพลงที่ต้องการแล้วคัดลอกลิงก์ของเพลงนั้น" }
            if (/^\/(@|channel\/|c\/|user\/)/.test(u.pathname)) return { kind: "error", reason: "นี่เป็นลิงก์ช่อง ต้องเป็นลิงก์ของวิดีโอ" }
            return { kind: "error", reason: "ลิงก์นี้ไม่ใช่วิดีโอ ลองคัดลอกจากปุ่มแชร์ของเพลง" }
        }
        return { kind: "error", reason: "ต้องเป็นลิงก์จากยูทูบ (youtube.com หรือ youtu.be)" }
    }

    window.fmt = { escapeHtml, watchUrl, shortDevice, agoText, agoLabel, agoSpan, tickAgo, icon, hydrateIcons, parseYouTube, YT_ID_RE }
})()
