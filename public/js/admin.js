(function () {
    const { escapeHtml: esc, icon, watchUrl, shortDevice, agoSpan, parseYouTube, hydrateIcons } = window.fmt
    const DEFAULTS = { requestCap: 2, openTime: "06:30", closeTime: "07:45", requestOpen: true, autoplay: true }
    const UNNAMED = "ไม่ระบุชื่อ"
    const STATUS_LABEL = { queued: "รอคิว", playing: "กำลังเปิด", played: "เปิดแล้ว", skipped: "ข้ามเพลง" }

    let latestSnapshot = null
    let pendingSnapshot = null
    let dragging = false
    let settingsDirty = false
    const reviewing = new Set()
    let openPreviewId = null

    const $ = (id) => document.getElementById(id)
    const loginSection = $("login-section")
    const panelSection = $("panel-section")
    const loginForm = $("login-form")
    const passwordInput = $("password-input")
    const loginBtn = $("login-btn")
    const loginBtnLabel = $("login-btn-label")

    const settingsStatus = $("settings-status")
    const requestOpenToggle = $("request-open-toggle")
    const autoplayToggle = $("autoplay-toggle")
    const capInput = $("cap-input")
    const openTimeInput = $("open-time-input")
    const closeTimeInput = $("close-time-input")
    const settingsSaveBtn = $("settings-save-btn")
    const settingsSaveLabel = $("settings-save-label")
    const settingsResetBtn = $("settings-reset-btn")
    const settingsStatusMsg = $("settings-status-msg")

    const queuePanel = $("admin-queue")
    const onairPanel = $("admin-onair")
    const playedPanel = $("admin-played")

    hydrateIcons()
    const act = async (fn, failMsg = "ทำรายการไม่สำเร็จ ลองอีกครั้ง") => {
        try { return await fn() }
        catch (err) {
            window.ui.showToast(err.status === 401 ? "หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่" : failMsg, "error")
            return undefined
        }
    }
    const post = (path, body) => window.api.post(path, body)
    const whoOf = (r) => r.nickname || UNNAMED
    const clip = (t, n = 28) => (t && t.length > n ? t.slice(0, n) + "…" : t || "")

    // tab
    const tabButtons = document.querySelectorAll(".tab-btn")
    const panels = { queue: $("panel-queue"), history: $("panel-history"), settings: $("panel-settings") }
    function switchTab(name) {
        Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== name })
        tabButtons.forEach((btn) => {
            const active = btn.dataset.tab === name
            btn.classList.toggle("active", active)
            btn.setAttribute("aria-selected", active ? "true" : "false")
        })
    }
    tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)))

    // auth
    const setLoginBusy = (busy) => {
        loginBtn.disabled = busy
        passwordInput.disabled = busy
        loginBtnLabel.innerHTML = busy ? '<span class="spinner"></span> กำลังเข้าสู่ระบบ...' : "เข้าสู่ระบบ"
    }
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault()
        passwordInput.classList.remove("is-error")
        setLoginBusy(true)
        try {
            await window.api.post("/api/admin/login", { password: passwordInput.value })
            onAuthed()
        } catch (err) {
            passwordInput.classList.add("is-error")
            passwordInput.value = ""
            passwordInput.focus()
            window.ui.showToast(err.code === "too_many_attempts" ? "ลองรหัสผ่านผิดหลายครั้งเกินไป กรุณารอสักครู่" : "รหัสผ่านไม่ถูกต้อง", "error")
        } finally { setLoginBusy(false) }
    })
    $("logout-btn").addEventListener("click", async () => {
        await window.api.post("/api/admin/logout")
        location.reload()
    })

    const openHelp = () => window.ui.openInfoModal(
        "วิธีใช้งานห้องควบคุม",
        `<p><strong>การ์ดเพลงในคิว</strong> ปุ่มซ้าย ⋮⋮ ลากเพื่อสลับลำดับ (ลากได้ทั้งเมาส์และนิ้ว) และ ▲▼ เลื่อนทีละขั้น</p>
         <p>แตะรูปเพื่อดูตัวอย่าง (เปิดได้ทีละเพลง) แตะชื่อเพลงเพื่อเปิดใน YouTube วงกลมหน้าชื่อคือ "ตรวจแล้ว" ใช้ทำเครื่องหมายว่าฟังแล้วผ่าน</p>
         <p><strong>เล่นเลย</strong> ตั้งเพลงนี้เป็นเพลงที่กำลังเปิด ถ้ามีเพลงอื่นเปิดอยู่ เพลงนั้นจะถูกย้ายไปท้ายคิว</p>
         <p><strong>✕ มุมขวาบน</strong> เลือกได้ว่าจะ "ข้ามเพลง" (ผู้ขอเห็นสถานะและเหตุผล) หรือ "ลบทิ้ง" (หายไปจากรายการของผู้ขอ)</p>
         <p><strong>แถบเหลือง</strong> คือข้อความที่ผู้ขอฝากถึง PR คนอื่นไม่เห็น</p>
         <p><strong>แท็บประวัติ</strong> ดูเพลงที่เล่นแล้ว เปิดซ้ำหรือย้ายกลับเข้าคิวได้</p>`
    )
    $("help-btn").addEventListener("click", openHelp)

    const onAuthed = () => {
        loginSection.style.display = "none"
        panelSection.style.display = "block"
        const short = shortDevice(localStorage.getItem("msq_device_id"))
        if (short) $("admin-device-chip").textContent = short
        else $("admin-device-chip").hidden = true
        window.api.get("/api/state").then(onSnapshot).catch(() => { })
        window.connectEvents(onSnapshot, {
            onDisconnected: () => window.ui.showToast("การเชื่อมต่อขาดหาย กำลังลองใหม่...", "error"),
            onReconnected: () => window.ui.showToast("เชื่อมต่อใหม่แล้ว"),
        })
        if (!localStorage.getItem("msq_admin_seen_help")) {
            localStorage.setItem("msq_admin_seen_help", "1")
            setTimeout(openHelp, 500)
        }
    }
    window.api.get("/api/admin/me").then((r) => r.authed && onAuthed()).catch(() => { })

    // settings
    const applySettingsStatus = () => {
        if (!latestSnapshot) return
        const status = window.timeUtil.computeLiveStatus(latestSnapshot.session)
        settingsStatus.className = `status-pill ${status.open ? "is-open" : "is-closed"}`
        settingsStatus.innerHTML = `<span class="status-dot"></span><span>${esc(status.label)}</span>`
    }
    setInterval(applySettingsStatus, 30000)

    const setSettingsBusy = (busy) => {
        settingsSaveBtn.disabled = busy; settingsResetBtn.disabled = busy
        requestOpenToggle.disabled = busy; autoplayToggle.disabled = busy
        capInput.disabled = busy; openTimeInput.disabled = busy; closeTimeInput.disabled = busy
        settingsSaveLabel.innerHTML = busy ? '<span class="spinner"></span> กำลังบันทึก...' : "บันทึกจำนวนและเวลา"
    }
        ;[capInput, openTimeInput, closeTimeInput].forEach((el) => el.addEventListener("input", () => { settingsDirty = true }))

    const bindToggle = (el, key, onMsg, offMsg) => el.addEventListener("change", async () => {
        const ok = await act(() => post("/api/admin/settings", { [key]: el.checked }), "เปลี่ยนการตั้งค่าไม่สำเร็จ")
        if (ok === undefined) el.checked = !el.checked
        else window.ui.showToast(el.checked ? onMsg : offMsg)
    })
    bindToggle(requestOpenToggle, "requestOpen", "เปิดรับคำขอเพลงแล้ว", "หยุดรับคำขอเพลงชั่วคราว")
    bindToggle(autoplayToggle, "autoplay", "เปิดเล่นเพลงถัดไปอัตโนมัติ", "ปิดเล่นอัตโนมัติ")

    settingsSaveBtn.addEventListener("click", async () => {
        const cap = parseInt(capInput.value, 10)
        const patch = {}
        if (!Number.isNaN(cap)) patch.requestCap = cap
        if (openTimeInput.value) patch.openAt = window.timeUtil.bangkokTimeToEpochToday(openTimeInput.value)
        if (closeTimeInput.value) patch.closeAt = window.timeUtil.bangkokTimeToEpochToday(closeTimeInput.value)
        setSettingsBusy(true)
        settingsStatusMsg.textContent = "กำลังบันทึก..."
        const ok = await act(() => post("/api/admin/settings", patch), "บันทึกการตั้งค่าไม่สำเร็จ ลองอีกครั้ง")
        if (ok !== undefined) { settingsDirty = false; settingsStatusMsg.textContent = "บันทึกแล้ว"; window.ui.showToast("บันทึกการตั้งค่าแล้ว") }
        setSettingsBusy(false)
    })

    const diffRow = (label, o, n) => `<li><span>${label}</span><span><span class="diff-old">${o}</span><span class="diff-new">${n}</span></span></li>`
    const resetDiffHtml = () => {
        if (!latestSnapshot) return "<p>ไม่พบข้อมูลปัจจุบัน</p>"
        const cur = latestSnapshot.session
        const t = window.timeUtil.bangkokTimeStr
        const rows = []
        if (cur.requestCap !== DEFAULTS.requestCap) rows.push(diffRow("จำนวนสูงสุดต่อคน", cur.requestCap, DEFAULTS.requestCap))
        if (t(cur.openAt) !== DEFAULTS.openTime) rows.push(diffRow("เปิดรับตอน", t(cur.openAt), DEFAULTS.openTime))
        if (t(cur.closeAt) !== DEFAULTS.closeTime) rows.push(diffRow("ปิดรับตอน", t(cur.closeAt), DEFAULTS.closeTime))
        if (cur.requestOpen !== DEFAULTS.requestOpen) rows.push(diffRow("รับคำขอเพลง", cur.requestOpen ? "เปิด" : "ปิด", DEFAULTS.requestOpen ? "เปิด" : "ปิด"))
        if (cur.autoplay !== DEFAULTS.autoplay) rows.push(diffRow("เล่นเพลงถัดไปอัตโนมัติ", cur.autoplay ? "เปิด" : "ปิด", DEFAULTS.autoplay ? "เปิด" : "ปิด"))
        if (!rows.length) return "<p>การตั้งค่าปัจจุบันตรงกับค่าเริ่มต้นอยู่แล้ว ไม่มีอะไรต้องเปลี่ยน</p>"
        return `<p>การตั้งค่าต่อไปนี้จะถูกเปลี่ยนกลับเป็นค่าเริ่มต้น:</p><ul class="diff-list">${rows.join("")}</ul>`
    }
    settingsResetBtn.addEventListener("click", async () => {
        const ok = await window.ui.confirm({ title: "รีเซ็ตเป็นค่าเริ่มต้น", bodyHtml: resetDiffHtml(), confirmLabel: "รีเซ็ต" })
        if (!ok) return
        const done = await act(() => post("/api/admin/settings/reset"), "รีเซ็ตไม่สำเร็จ ลองอีกครั้ง")
        if (done !== undefined) { settingsDirty = false; applySettingsInputs(latestSnapshot, true); window.ui.showToast("รีเซ็ตการตั้งค่าเรียบร้อยแล้ว") }
    })

    $("clear-btn").addEventListener("click", async () => {
        const result = await window.ui.openModal({
            title: "ล้างคิว / โควตา",
            bodyHtml: "<p>เลือกสิ่งที่ต้องการล้าง ข้อมูลที่ล้างแล้วกู้คืนไม่ได้ (การล้างคิวหรือประวัติจะคืนโควตาให้ผู้ที่ถูกล้างโดยอัตโนมัติ)</p>",
            fields: [{
                id: "scope", type: "radio", default: "queued",
                options: [
                    { value: "queued", label: "คิวที่รอเล่น" },
                    { value: "played", label: "ประวัติเพลงที่เล่นแล้ว" },
                    { value: "both", label: "ทั้งคิวและประวัติ" },
                    { value: "user_quota", label: "รีเซ็ตโควตาทุกคน", desc: "ไม่ลบเพลง" },
                ],
            }],
            actions: [{ label: "ยกเลิก", value: "cancel" }, { label: "ล้างเลย", value: "confirm", variant: "danger-solid" }],
        })
        if (!result || result.action !== "confirm") return
        const done = await act(() => post("/api/admin/queue/clear", { scope: result.values.scope }), "ล้างข้อมูลไม่สำเร็จ ลองอีกครั้ง")
        if (done !== undefined) window.ui.showToast("ล้างข้อมูลเรียบร้อยแล้ว")
    })

    function applySettingsInputs(snap, force = false) {
        requestOpenToggle.checked = snap.session.requestOpen
        autoplayToggle.checked = snap.session.autoplay
        if (settingsDirty && !force) return
        capInput.value = snap.session.requestCap
        openTimeInput.value = window.timeUtil.bangkokTimeStr(snap.session.openAt)
        closeTimeInput.value = window.timeUtil.bangkokTimeStr(snap.session.closeAt)
    }

    const addToggle = $("add-toggle"), addWrap = $("add-wrap"), addUrl = $("add-youtube-url"), addMsg = $("add-url-msg")
    const addNick = $("add-nickname"), addBtn = $("add-song-btn"), addLabel = $("add-song-label")
    let addParsed = { kind: "empty" }

    addToggle.addEventListener("click", () => {
        const open = addWrap.hidden
        addWrap.hidden = !open
        addToggle.setAttribute("aria-expanded", open ? "true" : "false")
        if (open) addUrl.focus({ preventScroll: true })
    })
    const addDuplicate = () => {
        if (!latestSnapshot || addParsed.kind !== "ok") return false
        const s = latestSnapshot
        return [s.nowPlaying, ...s.queue, ...s.played].some((r) => r && r.youtubeId === addParsed.id)
    }
    function renderAddState() {
        addUrl.classList.remove("is-error", "is-ok")
        const dupe = addDuplicate()
        if (addParsed.kind === "error") { addUrl.classList.add("is-error"); addMsg.className = "field-msg err"; addMsg.innerHTML = `${icon("alert", 16)}<span>${esc(addParsed.reason)}</span>` }
        else if (dupe) { addUrl.classList.add("is-error"); addMsg.className = "field-msg err"; addMsg.innerHTML = `${icon("alert", 16)}<span>เพลงนี้อยู่ในคิวหรือเปิดไปแล้ว</span>` }
        else if (addParsed.kind === "ok") { addUrl.classList.add("is-ok"); addMsg.className = "field-msg ok"; addMsg.innerHTML = `${icon("okc", 16)}<span>ลิงก์ถูกต้อง</span>` }
        else { addMsg.className = "field-msg"; addMsg.textContent = "" }
        addBtn.disabled = addParsed.kind !== "ok" || dupe
    }
    let addTimer = null
    addUrl.addEventListener("input", () => {
        addParsed = parseYouTube(addUrl.value)
        clearTimeout(addTimer)
        if (addParsed.kind === "error") { const keep = addParsed; addParsed = { kind: "empty" }; addTimer = setTimeout(() => { addParsed = keep; renderAddState() }, 650) }
        renderAddState()
    })
    addUrl.addEventListener("paste", () => setTimeout(() => addUrl.dispatchEvent(new Event("input")), 0))
    $("add-song-form").addEventListener("submit", async (e) => {
        e.preventDefault()
        if (addBtn.disabled) return
        addBtn.disabled = true
        addLabel.innerHTML = '<span class="spinner"></span> กำลังเพิ่ม...'
        try {
            await window.api.post("/api/admin/queue/add", { youtubeUrl: addParsed.url, nickname: addNick.value.trim() || null })
            addUrl.value = ""; addNick.value = ""; addParsed = { kind: "empty" }
            window.ui.showToast("เพิ่มเพลงเข้าคิวแล้ว")
        } catch (err) {
            window.ui.showToast(err.code === "duplicate_song" ? "เพลงนี้อยู่ในคิวแล้ว" : "เพิ่มเพลงไม่สำเร็จ", "error")
        }
        addLabel.textContent = "เพิ่มเข้าคิว"
        renderAddState()
    })

    const songSummary = (r) => `<img class="thumb" src="${esc(window.ytThumbnail(r.youtubeId))}" alt="" /><div style="min-width:0"><div class="mh-title">${esc(r.title || r.youtubeId)}</div><div class="mh-sub">${esc(whoOf(r))}</div></div>`
    async function removeSheet(r) {
        const res = await window.ui.openModal({
            title: "เอาเพลงนี้ออก",
            headerHtml: songSummary(r),
            fields: [
                {
                    id: "mode", type: "radio", default: "skip", options: [
                        { value: "skip", label: "ข้ามเพลง", desc: "ผู้ขอจะเห็นว่าเพลงถูกข้าม (พร้อมเหตุผลถ้าใส่) ไม่เสียโควตา", actionLabel: "ข้ามเพลง" },
                        { value: "trash", label: "ลบทิ้ง", desc: "หายไปจากคิวและรายการของผู้ขอเลย เหมาะกับเพลงที่ไม่เหมาะสมหรือสแปม", actionLabel: "ลบทิ้ง", danger: true },
                    ],
                },
                { id: "reason", type: "text", label: "เหตุผล (ไม่บังคับ ผู้ขอจะเห็น)", placeholder: "เช่น ไม่เหมาะกับเช้านี้", maxlength: 80, showWhen: { id: "mode", value: "skip" } },
            ],
            actions: [{ label: "ยกเลิก", value: "cancel" }, { label: "ข้ามเพลง", value: "confirm", variant: "ink", follow: true }],
        })
        if (!res || res.action !== "confirm") return
        if (res.values.mode === "trash") {
            const ok = await act(() => post(`/api/admin/queue/${encodeURIComponent(r.id)}/delete`))
            if (ok !== undefined) window.ui.showToast("ลบเพลงแล้ว")
        } else {
            const ok = await act(() => post(`/api/admin/queue/${encodeURIComponent(r.id)}/skip`, { reason: res.values.reason || null }))
            if (ok !== undefined) window.ui.showToast("ข้ามเพลงแล้ว")
        }
    }

    const playNow = async (r) => {
        const prev = latestSnapshot && latestSnapshot.nowPlaying
        const ok = await act(() => post(`/api/admin/queue/${encodeURIComponent(r.id)}/play`))
        if (ok !== undefined && prev && prev.id !== r.id) window.ui.showToast(`เปิด "${clip(r.title || r.youtubeId)}" แล้ว เพลง "${clip(prev.title || prev.youtubeId)}" ย้ายไปท้ายคิว`)
    }
    const markPlayed = (r) => act(() => post(`/api/admin/queue/${encodeURIComponent(r.id)}/played`))
    const requeue = async (r) => {
        const ok = await act(() => post(`/api/admin/queue/${encodeURIComponent(r.id)}/requeue`))
        if (ok !== undefined) window.ui.showToast("ย้ายกลับเข้าคิวแล้ว (ท้ายคิว)")
    }
    const toggleReview = async (r) => {
        if (reviewing.has(r.id)) return
        reviewing.add(r.id)
        await act(() => post(`/api/admin/queue/${encodeURIComponent(r.id)}/review`, { reviewed: !r.reviewed }))
        reviewing.delete(r.id)
    }
    const move = async (id, dir) => {
        if (!latestSnapshot) return
        const ids = latestSnapshot.queue.map((q) => q.id)
        const idx = ids.indexOf(id)
        const to = idx + dir
        if (idx === -1 || to < 0 || to >= ids.length) return
            ;[ids[idx], ids[to]] = [ids[to], ids[idx]]
        await act(() => post("/api/admin/queue/reorder", { orderedIds: ids }), "จัดลำดับไม่สำเร็จ ลองอีกครั้ง")
    }

    function closePreview(card) {
        const box = card && card.querySelector(".song-preview")
        if (box) { box.innerHTML = ""; box.hidden = true }
    }
    function togglePreview(card, r) {
        const opening = openPreviewId !== r.id
        queuePanel.querySelectorAll(".song").forEach((c) => closePreview(c))
        openPreviewId = null
        if (opening && window.fmt.YT_ID_RE.test(r.youtubeId || "")) {
            const box = card.querySelector(".song-preview")
            const iframe = document.createElement("iframe")
            iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(r.youtubeId)}?autoplay=1&playsinline=1`
            iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture")
            iframe.setAttribute("allowfullscreen", "")
            iframe.title = `ตัวอย่าง ${r.title || ""}`
            box.appendChild(iframe)
            box.hidden = false
            openPreviewId = r.id
        }
        queuePanel.querySelectorAll(".song").forEach((c) => { const rr = songById(c.dataset.id); if (rr) renderTop(c, rr) })
    }

    const songById = (id) => {
        const s = latestSnapshot
        if (!s) return null
        return s.queue.find((q) => q.id === id) || (s.nowPlaying && s.nowPlaying.id === id ? s.nowPlaying : null) || s.played.find((p) => p.id === id) || null
    }

    const noteStrip = (note) => note ? `<div class="note-strip">${icon("note", 15)}<span>${esc(note)}</span></div>` : ""
    const devChip = (r) => r.source === "admin" || !r.deviceId
        ? '<span class="chip pr">PR เพิ่มเอง</span>'
        : `<button type="button" class="chip dev" data-device="${esc(r.deviceId)}" title="ดูคำขอทั้งหมดของอุปกรณ์นี้">${esc(shortDevice(r.deviceId))}</button>`
    const metaLine = (r, extra = "") => `<span class="who">${esc(whoOf(r))}</span>${devChip(r)}${extra}`

    function renderTop(card, r) {
        const open = openPreviewId === r.id
        card.querySelector(".s-top").innerHTML = `
            <div class="s-head">
                <button type="button" class="thumb-btn" data-act="preview" aria-label="${open ? "ปิดตัวอย่าง" : "ดูตัวอย่าง"}" aria-expanded="${open}">
                    <img src="${esc(window.ytThumbnail(r.youtubeId))}" alt="" loading="lazy" />
                    <span class="ov">${icon(open ? "x" : "eye", 12)}${open ? "ปิด" : "ตัวอย่าง"}</span>
                </button>
                <div class="s-head-side">
                    <span>${agoSpan(r.createdAt, "plain")}</span>
                    ${r.reviewed ? `<span class="chip reviewed">${icon("check", 11)}ตรวจแล้ว</span>` : '<span style="color:var(--faint)">ยังไม่ได้ตรวจ</span>'}
                </div>
            </div>
            <button type="button" class="x-btn" data-act="remove" aria-label="เอาเพลงนี้ออก (ข้ามหรือลบ)" title="ข้ามหรือลบเพลงนี้">${icon("x", 20)}</button>`
    }

    const titleAnchor = (r) => `<a class="s-title" href="${watchUrl(r.youtubeId)}" target="_blank" rel="noopener">${esc(r.title || r.youtubeId)}${icon("external", 13)}</a>`

    function renderQueueCard(card, r, idx, total) {
        card.querySelector(".song-rail").innerHTML = `
            <button type="button" class="rail-btn grip" data-act="grip" aria-label="ลากเพื่อสลับลำดับ" title="ลากเพื่อสลับลำดับ">${icon("grip", 20)}</button>
            <button type="button" class="rail-btn" data-act="up" aria-label="เลื่อนขึ้น" ${idx === 0 ? "disabled" : ""}>${icon("up", 22)}</button>
            <button type="button" class="rail-btn" data-act="down" aria-label="เลื่อนลง" ${idx === total - 1 ? "disabled" : ""}>${icon("down", 22)}</button>`
        renderTop(card, r)
        card.querySelector(".s-rest").innerHTML = `
            <div class="s-titleline">
                <button type="button" class="check" data-act="review" role="checkbox" aria-checked="${r.reviewed}" aria-pressed="${r.reviewed}" aria-label="ตรวจแล้ว" title="${r.reviewed ? "ยกเลิกเครื่องหมายตรวจแล้ว" : "ทำเครื่องหมายว่าตรวจแล้ว"}">${icon("check", 16)}</button>
                ${titleAnchor(r)}
            </div>
            <div class="s-meta">${metaLine(r)}</div>
            ${r.note ? `<div style="margin-left:38px">${noteStrip(r.note)}</div>` : ""}
            <button type="button" class="btn-play" data-act="play">${icon("play", 18)}เล่นเลย</button>`
    }

    const queueSig = (r, idx, all) => JSON.stringify([r.title, r.nickname, r.note, r.reviewed, r.source, r.deviceId, r.createdAt, idx === 0, idx === all.length - 1, openPreviewId === r.id])

    function makeQueueCard() {
        const el = document.createElement("article")
        el.className = "song"
        el.innerHTML = '<div class="song-rail"></div><div class="song-main"><div class="s-top"></div><div class="song-preview" hidden></div><div class="s-rest"></div></div>'
        return el
    }

    function reconcileQueue(items) {
        const keep = new Set(items.map((i) => i.id))
            ;[...queuePanel.children].forEach((c) => { if (!c.dataset.id || !keep.has(c.dataset.id)) c.remove() })
        let prev = null
        items.forEach((r, idx) => {
            let el = [...queuePanel.children].find((c) => c.dataset.id === r.id)
            if (!el) { el = makeQueueCard(); el.dataset.id = r.id }
            const sig = queueSig(r, idx, items)
            if (el.dataset.sig !== sig) { renderQueueCard(el, r, idx, items.length); el.dataset.sig = sig }
            const expected = prev ? prev.nextElementSibling : queuePanel.firstElementChild
            if (expected !== el) queuePanel.insertBefore(el, expected)
            prev = el
        })
        if (openPreviewId && !keep.has(openPreviewId)) openPreviewId = null
    }

    function renderOnAir(r) {
        onairPanel.classList.toggle("idle", !r)
        if (!r) {
            onairPanel.innerHTML = `
                <div class="onair-head"><span>กำลังเปิดอยู่</span></div>
                <div class="onair-idle-text">ยังไม่มีเพลงกำลังเปิด<br>${latestSnapshot && latestSnapshot.session.autoplay ? "เมื่อมีเพลงในคิว ระบบจะดึงเพลงแรกมาเปิดให้เอง" : 'เลือกเพลงจากคิวแล้วกด "เล่นเลย"'}</div>`
            return
        }
        onairPanel.innerHTML = `
            <div class="onair-head"><span>กำลังเปิดอยู่</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
            <button type="button" class="x-btn" data-act="remove" aria-label="เอาเพลงนี้ออก (ข้ามหรือลบ)" title="ข้ามหรือลบเพลงนี้" style="top:8px;right:8px">${icon("x", 20)}</button>
            <div class="onair-song">
                <a class="thumb-link" href="${watchUrl(r.youtubeId)}" target="_blank" rel="noopener" aria-label="เปิดใน YouTube"><img class="thumb" src="${esc(window.ytThumbnail(r.youtubeId))}" alt="" /></a>
                <div style="min-width:0;padding-right:30px">
                    <a class="onair-title" href="${watchUrl(r.youtubeId)}" target="_blank" rel="noopener">${esc(r.title || r.youtubeId)}</a>
                </div>
            </div>
            <div class="onair-meta s-meta" style="padding:0;margin:4px 0 0;color:#b6bcc8">${metaLine(r)}</div>
            ${r.note ? noteStrip(r.note) : ""}
            <div class="onair-actions">
                <button type="button" class="btn done" data-act="played">${icon("check", 18)}เล่นจบแล้ว</button>
                <button type="button" class="btn" data-act="requeue">${icon("undo", 18)}กลับเข้าคิว</button>
            </div>
            <a class="link-btn onair-open" href="${watchUrl(r.youtubeId)}" target="_blank" rel="noopener">${icon("external", 15)}เปิดใน YouTube</a>`
    }

    const playedCard = (r) => `
        <article class="song no-rail" data-id="${esc(r.id)}">
            <div class="song-main">
                <div class="s-head" style="padding-right:0">
                    <a class="thumb-btn" href="${watchUrl(r.youtubeId)}" target="_blank" rel="noopener" aria-label="เปิดใน YouTube"><img src="${esc(window.ytThumbnail(r.youtubeId))}" alt="" loading="lazy" /></a>
                    <div class="s-head-side"><span>${r.playedAt ? agoSpan(r.playedAt, "played") : ""}</span></div>
                </div>
                <div class="s-titleline">${titleAnchor(r)}</div>
                <div class="s-meta" style="padding-left:0;margin-top:0">${metaLine(r)}</div>
                ${r.note ? noteStrip(r.note) : ""}
                <div class="btn-row">
                    <button type="button" class="btn small" data-act="replay">${icon("play", 14)}เปิดอีกครั้ง</button>
                    <button type="button" class="btn small" data-act="requeue">${icon("undo", 15)}กลับเข้าคิว</button>
                </div>
            </div>
        </article>`

    function render(snap) {
        latestSnapshot = snap
        applySettingsStatus()
        applySettingsInputs(snap)

        renderOnAir(snap.nowPlaying)
        $("queue-count").textContent = snap.queue.length ? `(${snap.queue.length})` : ""
        if (snap.queue.length === 0) {
            queuePanel.innerHTML = '<p class="empty-hint">คิวว่าง รอคำขอจากนักเรียน หรือกด "เพิ่มเพลง"</p>'
            openPreviewId = null
        } else {
            reconcileQueue(snap.queue)
        }

        playedPanel.innerHTML = snap.played.length ? snap.played.map(playedCard).join("") : '<p class="empty-hint">ยังไม่มีเพลงที่เปิดแล้ว</p>'
        $("stat-queue").textContent = snap.queue.length
        $("stat-played").textContent = snap.played.length
        const people = new Set([snap.nowPlaying, ...snap.queue, ...snap.played].filter((r) => r && r.source !== "admin" && r.deviceId).map((r) => r.deviceId))
        $("stat-people").textContent = people.size
        $("tab-queue-badge").hidden = snap.queue.length === 0
        renderAddState()
    }

    function onSnapshot(snap) {
        if (dragging) { pendingSnapshot = snap; return }
        render(snap)
    }

    document.addEventListener("click", (e) => {
        const dev = e.target.closest("[data-device]")
        if (dev) return openDeviceModal(dev.dataset.device)
        const btn = e.target.closest("[data-act]")
        if (!btn || btn.disabled) return
        const host = btn.closest("[data-id]")
        const onair = btn.closest("#admin-onair")
        const r = onair ? latestSnapshot && latestSnapshot.nowPlaying : host && songById(host.dataset.id)
        if (!r) return
        switch (btn.dataset.act) {
            case "preview": return togglePreview(host, r)
            case "review": return toggleReview(r)
            case "play": case "replay": return playNow(r)
            case "up": return move(r.id, -1)
            case "down": return move(r.id, 1)
            case "remove": return removeSheet(r)
            case "played": return markPlayed(r)
            case "requeue": return requeue(r)
        }
    })

    queuePanel.addEventListener("pointerdown", (e) => {
        const grip = e.target.closest('[data-act="grip"]')
        if (!grip || (e.pointerType === "mouse" && e.button !== 0)) return
        const card = grip.closest(".song")
        const cards = [...queuePanel.querySelectorAll(":scope > .song")]
        const from = cards.indexOf(card)
        if (from === -1 || cards.length < 2) return
        e.preventDefault()
        grip.setPointerCapture(e.pointerId)
        dragging = true
        card.classList.add("dragging")

        const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY
        const mids = cards.map((c) => pageTop(c) + c.offsetHeight / 2)
        const tops = cards.map((c) => pageTop(c))
        const bottoms = cards.map((c, i) => tops[i] + c.offsetHeight)
        const hostTop = pageTop(queuePanel)
        const startY = e.clientY, startScroll = window.scrollY
        const line = document.createElement("div")
        line.className = "drop-line"
        line.style.position = "absolute"; line.style.left = "0"; line.style.right = "0"
        queuePanel.appendChild(line)
        let lastY = e.clientY, target = from, raf = 0

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
            if (!dragging) return
            if (lastY < 90) window.scrollBy(0, -14)
            else if (lastY > window.innerHeight - 90) window.scrollBy(0, 14)
            update()
            raf = requestAnimationFrame(tick)
        }
        const onMove = (ev) => { lastY = ev.clientY }
        const finish = async (ev) => {
            grip.removeEventListener("pointermove", onMove)
            grip.removeEventListener("pointerup", finish)
            grip.removeEventListener("pointercancel", finish)
            cancelAnimationFrame(raf)
            dragging = false
            card.classList.remove("dragging"); card.style.transform = ""
            line.remove()
            const moved = ev.type === "pointerup" && target !== from
            if (moved) {
                const ids = cards.map((c) => c.dataset.id)
                ids.splice(target, 0, ids.splice(from, 1)[0])
                await act(() => post("/api/admin/queue/reorder", { orderedIds: ids }), "จัดลำดับไม่สำเร็จ ลองอีกครั้ง")
            }
            if (pendingSnapshot) { const s = pendingSnapshot; pendingSnapshot = null; render(s) }
        }
        grip.addEventListener("pointermove", onMove)
        grip.addEventListener("pointerup", finish)
        grip.addEventListener("pointercancel", finish)
        raf = requestAnimationFrame(tick)
    })

    async function openDeviceModal(deviceId) {
        window.ui.openInfoModal(`อุปกรณ์ ${shortDevice(deviceId)}`, '<p class="empty-hint">กำลังโหลด...</p>')
        const body = () => document.querySelector("#ui-modal-root .modal-body")
        let data
        try { data = await window.api.get(`/api/admin/device/${encodeURIComponent(deviceId)}/requests`) }
        catch { if (body()) body().innerHTML = '<p class="empty-hint">โหลดไม่สำเร็จ</p>'; return }
        if (!body()) return

        const rows = (data.requests || []).slice().reverse().map((r) => `
            <div class="row ${r.status}">
                <div class="row-main">
                    <a class="thumb-link" href="${watchUrl(r.youtubeId)}" target="_blank" rel="noopener"><img class="thumb" style="width:72px" src="${esc(window.ytThumbnail(r.youtubeId))}" alt="" /></a>
                    <div class="row-body">
                        <div class="row-title" style="color:var(--text)">${esc(r.title || r.youtubeId)}</div>
                        <div class="row-meta"><span class="who">${esc(whoOf(r))}</span>${agoSpan(r.createdAt)}</div>
                        <div class="status-line2"><span class="status-badge st-${r.status}">${STATUS_LABEL[r.status] || r.status}</span>${r.skipReason ? esc(r.skipReason) : ""}</div>
                    </div>
                </div>
                ${r.note ? `<div class="row-extra">${noteStrip(r.note)}</div>` : ""}
            </div>`).join("")
        body().innerHTML = `
            <div style="margin-bottom:8px"><button type="button" class="btn small danger block" data-reset-quota>รีเซ็ตโควตาของผู้ใช้นี้</button></div>
            ${rows || '<p class="empty-hint">ผู้ใช้นี้ยังไม่มีคำขอเพลง</p>'}`
        body().querySelector("[data-reset-quota]").addEventListener("click", async () => {
            const ok = await window.ui.confirm({ title: "รีเซ็ตโควตาของผู้ใช้นี้?", bodyHtml: `<p>อุปกรณ์ ${esc(shortDevice(deviceId))} จะขอเพลงได้เต็มโควตาอีกครั้ง เพลงเดิมยังอยู่ในคิว</p>`, confirmLabel: "รีเซ็ต" })
            if (!ok) return
            const done = await act(() => post("/api/admin/queue/clear", { scope: "user_quota", deviceId }), "รีเซ็ตไม่สำเร็จ ลองอีกครั้ง")
            if (done !== undefined) window.ui.showToast("รีเซ็ตโควตาแล้ว")
        })
    }
})()
