(function () {
    const { escapeHtml: esc, icon, watchUrl, agoSpan, parseYouTube, hydrateIcons } = window.fmt
    const DEVICE_KEY = "msq_device_id"
    const NICK_KEY = "msq_nickname"
    const HELP_SEEN_KEY = "msq_seen_help"
    const LONG_QUEUE_THRESHOLD = 12
    const ERROR_MESSAGES = {
        invalid_youtube_url: "ลิงก์ยูทูบไม่ถูกต้อง ลองตรวจสอบอีกครั้ง",
        duplicate_song: "เพลงนี้อยู่ในคิวแล้ว ลองเพลงอื่นดูนะ",
        cap_reached: "คุณขอเพลงครบจำนวนที่กำหนดของเช้านี้แล้ว",
        requests_closed: "ช่วงเวลารับคำขอเพลงปิดแล้ว",
        requests_not_open_yet: "ยังไม่ถึงเวลาขอเพลง ลองใหม่อีกครั้งนะ",
        not_removable: "เพลงนี้ถูกเปิดไปแล้ว จึงลบไม่ได้",
        not_editable: "แก้ไขไม่ได้แล้ว เพลงนี้เปิดจบหรือถูกข้ามไปแล้ว",
        not_found: "ไม่พบคำขอนี้ อาจถูกลบไปแล้ว",
    }
    const STATUS_LABEL = { queued: "รอคิว", playing: "กำลังเปิด", played: "เปิดแล้ว", skipped: "ข้ามเพลง" }
    const UNNAMED = "ไม่ระบุชื่อ"

    const getDeviceId = () => {
        let id = localStorage.getItem(DEVICE_KEY)
        if (!id) {
            id = "dev_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20)
            localStorage.setItem(DEVICE_KEY, id)
        }
        return id
    }

    const deviceId = getDeviceId()
    let latestSnapshot = null
    let latestMine = []
    let highlightId = null
    let formBusy = false
    let sessionOpenFlag = false

    const $ = (id) => document.getElementById(id)
    const tabButtons = document.querySelectorAll(".tab-btn")
    const panels = { request: $("panel-request"), me: $("panel-me") }
    const form = $("request-form")
    const urlInput = $("youtube-url")
    const urlMsg = $("url-msg")
    const urlPreview = $("url-preview")
    const nickInput = $("nickname")
    const noteInput = $("note")
    const noteToggle = $("note-toggle")
    const noteWrap = $("note-wrap")
    const submitBtn = $("submit-btn")
    const submitLabel = $("submit-btn-label")
    const formStatus = $("form-status")
    const capNote = $("cap-note")
    const statusLine = $("status-line")

    hydrateIcons()
    nickInput.value = localStorage.getItem(NICK_KEY) || ""

    const whoOf = (r) => r.nickname || UNNAMED
    const ytAttrs = (r) => `href="${watchUrl(r.youtubeId)}" data-yt="${esc(r.youtubeId)}" data-title="${esc(r.title || "")}"`
    const thumbLink = (r) => `<a class="yt-link thumb-link" ${ytAttrs(r)} aria-label="เปิดใน YouTube"><img class="thumb" src="${esc(window.ytThumbnail(r.youtubeId))}" alt="" loading="lazy" /></a>`
    const titleLink = (r) => `<a class="yt-link title-link" ${ytAttrs(r)}>${esc(r.title || r.youtubeId)}</a>`
    const reviewedChip = (r) => (r.reviewed ? `<span class="chip reviewed">${icon("check", 11)}ผ่านรีวิว</span>` : "")
    const noteStrip = (note) => `<div class="note-strip row-note">${icon("note", 15)}<span><b>ถึง PR:</b> ${esc(note)}</span></div>`

    document.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-yt]")
        if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
        e.preventDefault()
        window.ui.confirmLeave({ youtubeId: a.dataset.yt, title: a.dataset.title })
    })
    document.addEventListener("click", (e) => {
        const b = e.target.closest("[data-manage]")
        if (!b) return
        const r = latestMine.find((x) => x.id === b.dataset.manage)
        if (r) openManage(r)
    })
    document.addEventListener("click", (e) => {
        const b = e.target.closest("[data-remove]")
        if (!b) return
        const r = latestMine.find((x) => x.id === b.dataset.remove)
        if (r) removeMine(r)
    })

    function switchTab(name) {
        Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== name })
        tabButtons.forEach((btn) => {
            const active = btn.dataset.tab === name
            btn.classList.toggle("active", active)
            btn.setAttribute("aria-selected", active ? "true" : "false")
        })
        window.scrollTo({ top: 0 })
    }
    tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)))

    document.querySelectorAll("[data-seg]").forEach((btn) => btn.addEventListener("click", () => {
        document.querySelectorAll("[data-seg]").forEach((b) => b.setAttribute("aria-selected", b === btn ? "true" : "false"))
        document.querySelectorAll("[data-seg-panel]").forEach((p) => { p.hidden = p.dataset.segPanel !== btn.dataset.seg })
    }))

    const openHelp = () => window.ui.openInfoModal(
        "วิธีใช้งาน",
        `<p>วางลิงก์ยูทูบแล้วกด "ขอเพลง" การส่งคำขอ<strong>ไม่ได้การันตี</strong>ว่าเพลงจะถูกเปิด ขึ้นอยู่กับดุลยพินิจของ PR และเวลาที่เหลือในช่วงเช้า</p>
         <p><strong>สถานะ:</strong> รอคิว > กำลังเปิด > เปิดแล้ว หรือ ข้ามเพลง (ขอใหม่ได้ทันที ไม่เสียโควตา) ป้าย "ผ่านรีวิว" คือ PR ตรวจเพลงนี้แล้ว</p>
         <p><strong>จัดการคำขอของคุณ:</strong> แก้ชื่อหรือข้อความถึง PR ได้ และลบเพลงที่ยังรอคิวได้ที่แท็บ "ของฉัน" เพลงที่กำลังเปิดหรือเปิดแล้วลบไม่ได้</p>
         <p><strong>ข้อความถึง PR</strong> เห็นเฉพาะ PR คนอื่นไม่เห็น</p>`
    )
    $("help-btn").addEventListener("click", openHelp)
    if (!localStorage.getItem(HELP_SEEN_KEY)) {
        localStorage.setItem(HELP_SEEN_KEY, "1")
        setTimeout(openHelp, 500)
    }

    const usedQuota = () => latestMine.filter((r) => !r.quotaExempt && ["queued", "playing", "played"].includes(r.status)).length
    const capOf = () => (latestSnapshot ? latestSnapshot.session.requestCap : null)
    const capReached = () => capOf() !== null && usedQuota() >= capOf()

    const duplicateOf = (id) => {
        if (!latestSnapshot || !id) return null
        const s = latestSnapshot
        if (s.nowPlaying && s.nowPlaying.youtubeId === id) return "เพลงนี้กำลังเปิดอยู่ตอนนี้"
        if (s.queue.some((q) => q.youtubeId === id)) return "เพลงนี้อยู่ในคิวแล้ว ลองเพลงอื่นดูนะ"
        if (s.played.some((p) => p.youtubeId === id)) return "เพลงนี้เพิ่งเปิดไปแล้ว ลองเพลงอื่นดูนะ"
        return null
    }

    let parsed = { kind: "empty" }
    let urlTimer = null
    let preview = { id: null, status: "idle" } // idle | loading | ok | missing
    const titleCache = new Map()

    const setMsg = (tone, iconName, text) => {
        urlMsg.className = `field-msg ${tone}`
        urlMsg.innerHTML = text ? `${iconName ? icon(iconName, 16) : ""}<span>${esc(text)}</span>` : ""
    }

    async function fetchMeta(id) {
        if (titleCache.has(id)) return titleCache.get(id)
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 4000)
        let meta = { title: null, missing: false }
        try {
            const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(id))}&format=json`, { signal: ctrl.signal })
            if (res.status === 404) meta = { title: null, missing: true } // removed / private video
            else if (res.ok) meta = { title: (await res.json()).title || null, missing: false }
        } catch { /* blocked or offline */ }
        clearTimeout(timer)
        titleCache.set(id, meta)
        return meta
    }

    function renderPreview(id) {
        if (!id) { preview = { id: null, status: "idle" }; urlPreview.hidden = true; urlPreview.innerHTML = ""; return }
        if (preview.id === id) return
        preview = { id, status: "loading" }
        urlPreview.hidden = false
        urlPreview.innerHTML = `<img src="${esc(window.ytThumbnail(id))}" alt="" /><div><div class="pv-title">กำลังดึงชื่อเพลง...</div><div class="pv-sub">ตรวจสอบว่าใช่เพลงที่ต้องการ</div></div>`
        const img = urlPreview.querySelector("img")
        img.addEventListener("error", () => { if (preview.id === id && preview.status === "loading") { urlPreview.querySelector(".pv-sub").textContent = "ยังดูตัวอย่างไม่ได้ ตรวจสอบลิงก์อีกครั้ง" } })
        fetchMeta(id).then((meta) => {
            if (preview.id !== id) return
            preview.status = meta.missing ? "missing" : "ok"
            const box = urlPreview
            box.querySelector(".pv-title").textContent = meta.missing ? "ไม่พบวิดีโอนี้" : (meta.title || "ลิงก์ถูกต้อง")
            box.querySelector(".pv-sub").textContent = meta.missing ? "วิดีโอถูกลบหรือเป็นส่วนตัว ลองเพลงอื่นนะ" : 'ถ้าใช่เพลงนี้ กด "ขอเพลง" ได้เลย'
            showUrlState(parsed)
            refreshFormState()
        })
    }

    function showUrlState(p) {
        urlInput.classList.remove("is-error", "is-ok")
        if (p.kind === "ok") {
            renderPreview(p.id)
            const dupe = duplicateOf(p.id)
            const sub = urlPreview.querySelector(".pv-sub")
            if (sub) sub.hidden = !!dupe
            if (dupe) { urlInput.classList.add("is-error"); setMsg("err", "alert", dupe) }
            else if (preview.status === "missing") { urlInput.classList.add("is-error"); setMsg("err", "alert", "ไม่พบวิดีโอนี้ ลองเพลงอื่นนะ") }
            else { urlInput.classList.add("is-ok"); setMsg("ok", "okc", "ลิงก์ถูกต้อง") }
        } else {
            renderPreview(null)
            if (p.kind === "error") { urlInput.classList.add("is-error"); setMsg("err", "alert", p.reason) }
            else if (p.kind === "pending") setMsg("", "", "")
            else setMsg("", "", "คัดลอกลิงก์จากปุ่มแชร์ของเพลงในยูทูบ แล้ววางที่นี่")
        }
    }

    function onUrlInput(immediate) {
        parsed = parseYouTube(urlInput.value)
        clearTimeout(urlTimer)
        if (parsed.kind === "error" && !immediate) {
            showUrlState({ kind: "pending" })
            urlTimer = setTimeout(() => showUrlState(parsed), 650)
        } else showUrlState(parsed)
        refreshFormState()
    }
    urlInput.addEventListener("input", () => onUrlInput(false))
    urlInput.addEventListener("paste", () => setTimeout(() => onUrlInput(true), 0))
    urlInput.addEventListener("blur", () => onUrlInput(true))

    const pasteBtn = $("paste-btn")
    if (!navigator.clipboard || !navigator.clipboard.readText) pasteBtn.hidden = true
    pasteBtn.addEventListener("click", async () => {
        try {
            urlInput.value = await navigator.clipboard.readText()
            onUrlInput(true)
            urlInput.focus({ preventScroll: true })
        } catch { window.ui.showToast("วางอัตโนมัติไม่ได้ ลองกดค้างที่ช่องแล้วเลือกวาง", "error") }
    })

    const counter = (input, el) => { const upd = () => { el.textContent = input.value ? `${input.value.length}/${input.maxLength}` : "" }; input.addEventListener("input", upd); upd() }
    counter(nickInput, $("nick-count"))
    counter(noteInput, $("note-count"))
    nickInput.addEventListener("input", () => localStorage.setItem(NICK_KEY, nickInput.value.trim()))

    noteToggle.addEventListener("click", () => {
        const open = noteWrap.hidden
        noteWrap.hidden = !open
        noteToggle.setAttribute("aria-expanded", open ? "true" : "false")
        if (open) noteInput.focus({ preventScroll: true })
    })

    function submitBlock() {
        if (formBusy) return "busy"
        if (!sessionOpenFlag) return "closed"
        if (capReached()) return "cap"
        if (parsed.kind !== "ok") return "url"
        if (duplicateOf(parsed.id)) return "dupe"
        if (preview.id === parsed.id && preview.status === "missing") return "missing"
        return null
    }
    function refreshFormState() {
        const block = submitBlock()
        submitBtn.disabled = block !== null
        if (!formBusy) submitLabel.textContent = block === "closed" ? "ปิดรับคำขอ" : block === "cap" ? "ครบโควตาแล้ว" : "ขอเพลง"

        const cap = capOf()
        if (cap === null) capNote.textContent = ""
        else if (capReached()) capNote.innerHTML = `<span style="color:var(--red-strong);font-weight:500">คุณขอครบ ${cap} เพลงแล้ว ลบเพลงที่ยังรอคิวที่แท็บ "ของฉัน" เพื่อขอเพลงใหม่</span>`
        else capNote.textContent = `ขอได้ไม่เกิน ${cap} เพลงต่อคน (ใช้ไป ${usedQuota()}/${cap})`
    }

    function setFormBusy(busy) {
        formBusy = busy
        urlInput.disabled = busy; nickInput.disabled = busy; noteInput.disabled = busy
        submitLabel.innerHTML = busy ? '<span class="spinner"></span> กำลังส่งคำขอ...' : "ขอเพลง"
        refreshFormState()
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault()
        if (submitBlock() !== null) return
        const nickname = nickInput.value.trim()
        const note = noteInput.value.trim()
        localStorage.setItem(NICK_KEY, nickname)

        setFormBusy(true)
        formStatus.textContent = "กำลังส่งคำขอ..."
        try {
            const res = await window.api.post("/api/requests", { deviceId, youtubeUrl: parsed.url, nickname: nickname || null, note: note || null })
            highlightId = res.request.id
            urlInput.value = ""; noteInput.value = ""
            noteInput.dispatchEvent(new Event("input"))
            noteWrap.hidden = true; noteToggle.setAttribute("aria-expanded", "false")
            parsed = { kind: "empty" }; showUrlState(parsed)
            formStatus.textContent = "ส่งคำขอเรียบร้อยแล้ว"
            window.ui.showToast('ส่งคำขอแล้ว ดูสถานะได้ที่แท็บ "ของฉัน"')
            await refreshMine()
            switchTab("me")
            setTimeout(() => { highlightId = null; renderMineUI() }, 4000)
        } catch (err) {
            const message = ERROR_MESSAGES[err.code] || "ส่งคำขอไม่สำเร็จ ลองอีกครั้งนะ"
            formStatus.textContent = message
            if (err.code === "duplicate_song" || err.code === "invalid_youtube_url") { urlInput.classList.add("is-error"); setMsg("err", "alert", message) }
            window.ui.showToast(message, "error")
        } finally { setFormBusy(false) }
    })

    async function openManage(r) {
        const res = await window.ui.openModal({
            title: "แก้ไขคำขอ",
            headerHtml: `<img class="thumb" src="${esc(window.ytThumbnail(r.youtubeId))}" alt="" /><div style="min-width:0"><div class="mh-title">${esc(r.title || r.youtubeId)}</div><div class="mh-sub">${esc(STATUS_LABEL[r.status] || r.status)}</div></div>`,
            fields: [
                { id: "nickname", type: "text", label: "ชื่อเล่น", default: r.nickname || "", maxlength: 24, placeholder: "ไม่ใส่ก็ได้" },
                { id: "note", type: "textarea", label: "ข้อความถึง PR", default: r.note || "", maxlength: 120, placeholder: "เช่น ขอให้เปิดหลังประกาศเขต", hint: "เห็นเฉพาะ PR" },
            ],
            actions: [{ label: "ยกเลิก", value: "cancel" }, { label: "บันทึก", value: "save", variant: "primary" }],
            secondary: r.status === "queued" ? [{ label: "ลบเพลงนี้ออกจากคิว", value: "remove" }] : [],
        })
        if (!res) return
        if (res.action === "remove") return removeMine(r)
        if (res.action !== "save") return

        const patch = { deviceId }
        if (res.values.nickname !== (r.nickname || "")) patch.nickname = res.values.nickname
        if (res.values.note !== (r.note || "")) patch.note = res.values.note
        if (Object.keys(patch).length === 1) return window.ui.showToast("ไม่มีอะไรเปลี่ยน")
        try {
            await window.api.post(`/api/requests/${encodeURIComponent(r.id)}/update`, patch)
            window.ui.showToast("บันทึกแล้ว")
        } catch (err) { window.ui.showToast(ERROR_MESSAGES[err.code] || "บันทึกไม่สำเร็จ ลองอีกครั้ง", "error") }
        refreshMine()
    }

    async function removeMine(r) {
        const ok = await window.ui.confirm({
            title: "ลบเพลงนี้ออกจากคิว?",
            bodyHtml: `<p>'${esc(r.title || r.youtubeId)}' จะถูกลบ และคืนโควตาให้ 1 เพลง</p>`,
            confirmLabel: "ลบออกจากคิว", danger: true,
        })
        if (!ok) return
        try {
            await window.api.post(`/api/requests/${encodeURIComponent(r.id)}/remove`, { deviceId })
            window.ui.showToast("ลบแล้ว คืนโควตาให้ 1 เพลง")
        } catch (err) { window.ui.showToast(ERROR_MESSAGES[err.code] || "ลบไม่สำเร็จ ลองอีกครั้ง", "error") }
        refreshMine()
    }

    async function refreshMine() {
        try {
            const data = await window.api.get(`/api/requests/mine?deviceId=${encodeURIComponent(deviceId)}`)
            latestMine = data.requests
            if (latestSnapshot) renderSnapshotUI(latestSnapshot)
            renderMineUI()
        } catch { /* keep the last list */ }
    }
    const myIds = () => new Set(latestMine.map((r) => r.id))
    const positionInQueue = (id) => {
        if (!latestSnapshot) return null
        const idx = latestSnapshot.queue.findIndex((q) => q.id === id)
        return idx === -1 ? null : idx
    }

    function applyLiveStatus() {
        if (!latestSnapshot) return
        const status = window.timeUtil.computeLiveStatus(latestSnapshot.session)
        statusLine.className = `status-pill ${status.open ? "is-open" : "is-closed"}`
        statusLine.innerHTML = `<span class="status-dot"></span><span>${esc(status.label)}</span>`
        sessionOpenFlag = status.open
        refreshFormState()
    }

    const queueRow = (q, i, mine) => `
        <div class="row${mine ? " mine" : ""}">
            <div class="row-main">
                <span class="idx">${i + 1}</span>
                ${thumbLink(q)}
                <div class="row-body">
                    <div class="row-title">${titleLink(q)}</div>
                    <div class="row-meta">
                        <span class="who">${esc(whoOf(q))}</span> ${agoSpan(q.createdAt)}
                        ${mine ? '<span class="chip you">คุณ</span>' : ""}${reviewedChip(q)}
                        ${mine ? `<button type="button" class="edit-link" data-manage="${esc(q.id)}">${icon("pencil", 13)}แก้ไข</button>` : ""}
                    </div>
                </div>
            </div>
        </div>`

    const playedRow = (p) => `
        <div class="row played">
            <div class="row-main">
                ${thumbLink(p)}
                <div class="row-body">
                    <div class="row-title">${titleLink(p)}</div>
                    <div class="row-meta"><span class="who">${esc(whoOf(p))}</span> ${p.playedAt ? agoSpan(p.playedAt, "played") : agoSpan(p.createdAt)}</div>
                </div>
            </div>
        </div>`

    function renderSnapshotUI(snap) {
        applyLiveStatus()
        const mine = myIds()

        // on air
        const np = snap.nowPlaying
        $("onair").classList.toggle("idle", !np)
        $("onair-eq").hidden = !np
        $("now-playing").innerHTML = np
            ? `<div class="onair-song">${thumbLink(np)}<div style="min-width:0">
                    <a class="yt-link onair-title" ${ytAttrs(np)}>${esc(np.title || np.youtubeId)}</a>
                    </div></div><div class="onair-meta">${esc(whoOf(np))} ${agoSpan(np.createdAt)}</div>`
            : '<div class="onair-idle-text">ยังไม่มีเพลงกำลังเปิด เมื่อ PR เริ่มเปิดจะแสดงที่นี่</div>'

        // lists
        $("seg-queue-n").textContent = snap.queue.length ? snap.queue.length : ""
        $("seg-played-n").textContent = snap.played.length ? snap.played.length : ""
        $("queue-list").innerHTML = snap.queue.length
            ? snap.queue.map((q, i) => queueRow(q, i, mine.has(q.id))).join("")
            : '<p class="empty-hint">คิวว่างอยู่ ขอเพลงแรกได้เลย</p>'
        $("recent-played-list").innerHTML = snap.played.length
            ? snap.played.slice(0, 10).map(playedRow).join("")
            : '<p class="empty-hint">ยังไม่มีเพลงที่เปิดแล้ว</p>'

        const warn = $("queue-warning")
        warn.hidden = snap.queue.length < LONG_QUEUE_THRESHOLD
        if (!warn.hidden) warn.textContent = `คิวค่อนข้างยาว (${snap.queue.length} เพลง) เพลงที่ขอใหม่อาจไม่ได้เปิดทันภายในเวลารับเพลงวันนี้`

        renderContext()
        if (parsed.kind === "ok") showUrlState(parsed)
    }

    function renderContext() {
        const el = $("now-playing-context")
        const np = latestSnapshot && latestSnapshot.nowPlaying
        let text = ""
        if (np && latestMine.some((r) => r.id === np.id)) text = "นี่คือเพลงของคุณ กำลังเปิดอยู่ตอนนี้"
        else {
            let best = null
            latestMine.filter((r) => r.status === "queued").forEach((r) => {
                const idx = positionInQueue(r.id)
                if (idx !== null && (best === null || idx < best)) best = idx
            })
            if (best !== null) text = best === 0 ? "เพลงของคุณจะเปิดเป็นเพลงถัดไป" : `เพลงของคุณอยู่ในคิว มี ${best} เพลงก่อนหน้า`
        }
        el.hidden = !text
        el.textContent = text
    }

    function renderMineUI() {
        const cap = capOf()
        const used = usedQuota()
        $("quota-summary").innerHTML = cap === null ? '<div class="skeleton skeleton-line w-40"></div>' : `
            <div class="quota-row${used >= cap ? " full" : ""}">
                <span>${used} / ${cap} เพลง</span>
                <div class="quota-track"><div class="quota-fill" style="width:${cap > 0 ? Math.min(100, (used / cap) * 100) : 0}%"></div></div>
            </div>
            <div class="hint" style="margin-top:10px">เพลงที่ถูกข้าม ถูกลบ หรือซ้ำ จะไม่นับรวมในโควตา</div>
            <div class="device-id-row">เลขอุปกรณ์ <span class="chip dev">${esc(window.fmt.shortDevice(deviceId))}</span></div>`

        const list = $("mine-list")
        list.innerHTML = latestMine.length
            ? latestMine.slice().reverse().map(mineRow).join("")
            : '<p class="empty-hint">ยังไม่มีคำขอของคุณวันนี้ ไปที่แท็บ "ขอเพลง" ได้เลย</p>'

        $("tab-me-badge").hidden = !latestMine.some((r) => r.status === "queued" || r.status === "playing")
        refreshFormState()
        renderContext()
    }

    function mineRow(r) {
        const bits = [`<span class="status-badge st-${r.status}">${STATUS_LABEL[r.status] || r.status}</span>`]
        if (r.status === "queued") {
            const idx = positionInQueue(r.id)
            if (idx !== null) bits.push(idx === 0 ? "เป็นคิวถัดไป" : `มี ${idx} เพลงอยู่ก่อนคุณ`)
        }
        if (r.status === "skipped" && r.skipReason) bits.push(`เหตุผล: ${esc(r.skipReason)}`)
        if (r.reviewed && (r.status === "queued" || r.status === "playing")) bits.push(reviewedChip(r))

        const canEdit = r.status === "queued" || r.status === "playing"
        const actions = canEdit ? `<div class="row-actions">
                <button type="button" class="btn small" data-manage="${esc(r.id)}">${icon("pencil", 15)}แก้ไขชื่อ / ข้อความ</button>
                ${r.status === "queued" ? `<button type="button" class="btn small danger" data-remove="${esc(r.id)}">${icon("trash", 15)}ลบ</button>` : ""}
            </div>` : ""

        return `
        <div class="row ${r.status}${r.id === highlightId ? " is-new" : ""}">
            <div class="row-main">
                ${thumbLink(r)}
                <div class="row-body">
                    <div class="row-title">${titleLink(r)}</div>
                    <div class="row-meta"><span class="who">${esc(whoOf(r))} ${agoSpan(r.createdAt)}</div>
                    <div class="status-line2">${bits.join("")}</div>
                </div>
            </div>
            ${r.note || actions ? `<div class="row-extra">${r.note ? noteStrip(r.note) : ""}${actions}</div>` : ""}
        </div>`
    }

    function onSnapshot(snap) {
        latestSnapshot = snap
        renderSnapshotUI(snap)
        refreshMine()
    }

    showUrlState(parsed)
    window.api.get("/api/state").then(onSnapshot).catch(() => { })
    window.connectEvents(onSnapshot, {
        onDisconnected: () => window.ui.showToast("การเชื่อมต่อขาดหาย กำลังลองใหม่...", "error"),
        onReconnected: () => window.ui.showToast("เชื่อมต่อกลับมาแล้ว"),
    }, { deviceId })
    setInterval(applyLiveStatus, 30000)
})()
