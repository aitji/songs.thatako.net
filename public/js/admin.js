(function () {
    let latestSnapshot = null
    let dragSourceId = null
    let connectionsTimer = null
    let openDevicePanelId = null
    const DEFAULTS = {
        requestCap: 2,
        openTime: "06:30", closeTime: "07:45",
        requestOpen: true,
        autoplay: true,
    }

    const ICONS = {
        up: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 5 L20 16 L4 16 Z" fill="currentColor"/></svg>',
        down: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 19 L4 8 L20 8 Z" fill="currentColor"/></svg>',
        play: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 4 L20 12 L6 20 Z" fill="currentColor"/></svg>',
        skip: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 5 L19 19 M19 5 L5 19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
        trash: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 7 H19 M9 7 V5 H15 V7 M7 7 L8 20 H16 L17 7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        check: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 12 L10 18 L20 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        requeue: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 12a8 8 0 1 1 3 6.2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M4 17v-5h5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    }

    const $ = (e) => document.getElementById(e)
    const loginSection = $("login-section")
    const panelSection = $("panel-section")
    const loginForm = $("login-form")
    const passwordInput = $("password-input")
    const loginBtn = $("login-btn")
    const loginBtnLabel = $("login-btn-label")
    const logoutBtn = $("logout-btn")
    const helpBtn = $("help-btn")

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
    const clearBtn = $("clear-btn")

    const addForm = $("add-song-form")
    const addUrlInput = $("add-youtube-url")
    const addNickInput = $("add-nickname")
    const addSongBtn = $("add-song-btn")
    const addSongLabel = $("add-song-label")
    const addSongStatus = $("add-song-status")

    const nowPlayingPanel = $("admin-now-playing")
    const queuePanel = $("admin-queue")
    const playedPanel = $("admin-played")
    const connectionsPanel = $("admin-connections")
    const statConnections = $("stat-connections")
    const statQueue = $("stat-queue")
    const statPlayed = $("stat-played")

    const escapeHtml = (str) => {
        const d = document.createElement("div")
        d.textContent = str == null ? "" : str
        return d.innerHTML
    }

    const relTime = (epoch) => {
        const diffSec = Math.max(0, Math.floor((Date.now() - epoch) / 1000))
        if (diffSec < 60) return "เมื่อสักครู่"
        const diffMin = Math.floor(diffSec / 60)
        if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
        return `${Math.floor(diffMin / 60)} ชั่วโมงที่แล้ว`
    }

    const applySettingsStatus = () => {
        if (!latestSnapshot) return
        const status = window.timeUtil.computeLiveStatus(latestSnapshot.session)
        settingsStatus.className = `status-line ${status.open ? "is-open" : "is-closed"}`
        settingsStatus.innerHTML = `<span class="status-dot"></span><span>${status.label}</span>`
    }

    // tabs
    const tabButtons = document.querySelectorAll(".tab-btn")
    const panels = { queue: $("panel-queue"), settings: $("panel-settings"), status: $("panel-status") }

    function switchTab(name) {
        Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== name })
        tabButtons.forEach((btn) => {
            const active = btn.dataset.tab === name
            btn.classList.toggle("active", active)
            btn.setAttribute("aria-selected", active ? "true" : "false")
        })
        if (name === "status") {
            refreshConnections()
            if (!connectionsTimer) connectionsTimer = setInterval(refreshConnections, 6000)
        } else if (connectionsTimer) {
            clearInterval(connectionsTimer)
            connectionsTimer = null
        }
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
        passwordInput.classList.remove("input-error")
        setLoginBusy(true)
        try {
            await window.api.post("/api/admin/login", { password: passwordInput.value })
            onAuthed()
        } catch (err) {
            passwordInput.classList.add("input-error")
            passwordInput.value = ""
            passwordInput.focus()
            window.ui.showToast(
                err.code === "too_many_attempts" ? "ลองรหัสผ่านผิดหลายครั้งเกินไป กรุณารอสักครู่" : "รหัสผ่านไม่ถูกต้อง",
                "error"
            )
        } finally { setLoginBusy(false) }
    })

    logoutBtn.addEventListener("click", async () => {
        await window.api.post("/api/admin/logout")
        location.reload()
    })

    const onAuthed = () => {
        loginSection.style.display = "none"
        panelSection.style.display = "block"
        window.api.get("/api/state").then(renderSnapshot).catch(() => { })
        window.connectEvents(renderSnapshot, {
            onDisconnected: () => window.ui.showToast("การเชื่อมต่อขาดหาย กำลังลองใหม่...", "error"),
            onReconnected: () => window.ui.showToast("เชื่อมต่อใหม่แล้ว"),
        })
        if (!localStorage.getItem("msq_admin_seen_help")) {
            localStorage.setItem("msq_admin_seen_help", "1")
            setTimeout(openHelp, 500)
        }
    }

    window.api
        .get("/api/admin/me")
        .then((r) => (r.authed) && onAuthed())
        .catch(() => { })

    setInterval(applySettingsStatus, 30000)
    const openHelp = () => window.ui.openInfoModal(
        "วิธีใช้งานห้องควบคุม",
        `<p><strong>แท็บคิว</strong> ดูเพลงที่กำลังเปิดและคิวที่รออยู่ จัดลำดับ เล่น ข้าม หรือลบเพลงได้จากที่นี่</p>
            <p><strong>แท็บตั้งค่า</strong> เปิด/ปิดรับคำขอ ตั้งโควตา เวลาเปิด-ปิด เพิ่มเพลงเอง และล้างคิว/โควตา</p>
            <p><strong>แท็บสถานะ</strong> ดูว่ามีใครเปิดหน้าเว็บอยู่บ้าง (เชื่อมต่อ SSE) กับประวัติเพลงที่เล่นแล้ว</p>
            <p><strong>ไอคอนในคิว</strong> ▲▼ เลื่อนลำดับ<br>▶ เล่นเพลงนี้<br>↩ ย้อนกลับเข้าคิว<br>✕ ข้าม (ไม่นับโควตาผู้ส่ง)<br>🗑 ลบออก<br>ลากที่ "⋮⋮" เพื่อสลับลำดับได้เช่นกัน ปุ่มลูกศรใช้ได้เสมอแม้บนมือถือ</p>`
    )

    helpBtn.addEventListener("click", openHelp)
    const setSettingsBusy = (busy) => {
        settingsSaveBtn.disabled = busy
        settingsResetBtn.disabled = busy
        requestOpenToggle.disabled = busy
        autoplayToggle.disabled = busy
        capInput.disabled = busy
        openTimeInput.disabled = busy
        closeTimeInput.disabled = busy
        settingsSaveLabel.innerHTML = busy ? '<span class="spinner"></span> กำลังบันทึก...' : "บันทึกการตั้งค่า"
    }

    settingsSaveBtn.addEventListener("click", async () => {
        const cap = parseInt(capInput.value, 10)
        const patch = { requestOpen: requestOpenToggle.checked, autoplay: autoplayToggle.checked }
        if (!Number.isNaN(cap)) patch.requestCap = cap
        if (openTimeInput.value) patch.openAt = window.timeUtil.bangkokTimeToEpochToday(openTimeInput.value)
        if (closeTimeInput.value) patch.closeAt = window.timeUtil.bangkokTimeToEpochToday(closeTimeInput.value)

        setSettingsBusy(true)
        settingsStatusMsg.textContent = "กำลังบันทึก..."
        try {
            await window.api.post("/api/admin/settings", patch)
            settingsStatusMsg.textContent = "บันทึกการตั้งค่าแล้ว"
            window.ui.showToast("บันทึกการตั้งค่าแล้ว")
        } catch {
            settingsStatusMsg.textContent = "บันทึกไม่สำเร็จ"
            window.ui.showToast("บันทึกการตั้งค่าไม่สำเร็จ ลองอีกครั้ง", "error")
        } finally { setSettingsBusy(false) }
    })

    const diffRow = (label, oldV, newV) => `<li><span>${label}</span><span><span class="diff-old">${oldV}</span><span class="diff-new">${newV}</span></span></li>`
    const resetDiffHtml = () => {
        if (!latestSnapshot) return "<p>ไม่พบข้อมูลปัจจุบัน</p>"
        const cur = latestSnapshot.session
        const curOpenTime = window.timeUtil.bangkokTimeStr(cur.openAt)
        const curCloseTime = window.timeUtil.bangkokTimeStr(cur.closeAt)
        const rows = []
        if (cur.requestCap !== DEFAULTS.requestCap) rows.push(diffRow("จำนวนสูงสุดต่อคน", cur.requestCap, DEFAULTS.requestCap))
        if (curOpenTime !== DEFAULTS.openTime) rows.push(diffRow("เปิดรับตอน", curOpenTime, DEFAULTS.openTime))
        if (curCloseTime !== DEFAULTS.closeTime) rows.push(diffRow("ปิดรับตอน", curCloseTime, DEFAULTS.closeTime))
        if (cur.requestOpen !== DEFAULTS.requestOpen) rows.push(diffRow("รับคำขอเพลง", cur.requestOpen ? "เปิด" : "ปิด", DEFAULTS.requestOpen ? "เปิด" : "ปิด"))
        if (cur.autoplay !== DEFAULTS.autoplay) rows.push(diffRow("เล่นเพลงถัดไปอัตโนมัติ", cur.autoplay ? "เปิด" : "ปิด", DEFAULTS.autoplay ? "เปิด" : "ปิด"))
        if (rows.length === 0) return "<p>การตั้งค่าปัจจุบันตรงกับค่าเริ่มต้นอยู่แล้ว ไม่มีอะไรต้องเปลี่ยน</p>"
        return `<p>การตั้งค่าต่อไปนี้จะถูกเปลี่ยนกลับเป็นค่าเริ่มต้น:</p><ul class="diff-list">${rows.join("")}</ul>`
    }

    settingsResetBtn.addEventListener("click", async () => {
        const bodyHtml = resetDiffHtml()
        const result = await window.ui.openModal({
            title: "รีเซ็ตเป็นค่าเริ่มต้น",
            bodyText: bodyHtml,
            fields: [],
            actions: [
                { label: "ยกเลิก", value: "cancel" },
                { label: "รีเซ็ต", value: "confirm", variant: "primary" },
            ],
        })
        if (!result || result.action !== "confirm") return
        try {
            await window.api.post("/api/admin/settings/reset")
            window.ui.showToast("รีเซ็ตการตั้งค่าเรียบร้อยแล้ว")
        } catch { window.ui.showToast("รีเซ็ตไม่สำเร็จ ลองอีกครั้ง", "error") }
    })

    // clear queue / played / quota
    clearBtn.addEventListener("click", async () => {
        const result = await window.ui.openModal({
            title: "ล้างคิว / โควตา",
            bodyText: "เลือกสิ่งที่ต้องการล้าง ข้อมูลที่ล้างแล้วกู้คืนไม่ได้ (การล้างคิว/ประวัติจะคืนโควตาให้ผู้ที่ถูกล้างโดยอัตโนมัติ)",
            fields: [{
                id: "scope",
                type: "radio",
                label: "ล้างอะไร",
                default: "queued",
                options: [
                    { value: "queued", label: "คิวที่รอเล่น" },
                    { value: "played", label: "ประวัติเพลงที่เล่นแล้ว" },
                    { value: "both", label: "ทั้งคิวและประวัติ" },
                    { value: "user_quota", label: "รีเซ็ตโควตาทุกคน (ไม่ลบเพลง)" },
                ],
            }],
            actions: [
                { label: "ยกเลิก", value: "cancel" },
                { label: "ล้างเลย", value: "confirm", variant: "danger" },
            ],
        })
        if (!result || result.action !== "confirm") return
        try {
            await window.api.post("/api/admin/queue/clear", { scope: result.values.scope })
            window.ui.showToast("ล้างข้อมูลเรียบร้อยแล้ว")
        } catch { window.ui.showToast("ล้างข้อมูลไม่สำเร็จ ลองอีกครั้ง", "error") }
    })

    const setAddSongBusy = (busy) => {
        addSongBtn.disabled = busy
        addUrlInput.disabled = busy
        addNickInput.disabled = busy
        addSongLabel.innerHTML = busy ? '<span class="spinner"></span> กำลังเพิ่ม...' : "เพิ่มเข้าคิว"
    }

    addForm.addEventListener("submit", async (e) => {
        e.preventDefault()
        addUrlInput.classList.remove("input-error")
        setAddSongBusy(true)
        addSongStatus.textContent = "กำลังเพิ่มเพลง..."
        try {
            await window.api.post("/api/admin/queue/add", {
                youtubeUrl: addUrlInput.value.trim(),
                nickname: addNickInput.value.trim() || null,
            })
            addUrlInput.value = ""
            addNickInput.value = ""
            addSongStatus.textContent = "เพิ่มเพลงแล้ว"
            window.ui.showToast("เพิ่มเพลงเข้าคิวแล้ว")
        } catch (err) {
            const message = err.code === "duplicate_song" ? "เพลงนี้อยู่ในคิวแล้ว" : "เพิ่มเพลงไม่สำเร็จ"
            addSongStatus.textContent = message
            addUrlInput.classList.add("input-error")
            window.ui.showToast(message, "error")
        } finally { setAddSongBusy(false) }
    })

    const skip = async (id) => {
        const result = await window.ui.openModal({
            title: "ข้ามเพลงนี้",
            bodyText: "ใส่เหตุผลถ้าต้องการให้ผู้ส่งเห็น หรือปล่อยว่างไว้ก็ได้",
            fields: [{ id: "reason", label: "เหตุผล (ไม่บังคับ)", placeholder: "เช่น ไม่เหมาะกับเช้านี้" }],
            actions: [
                { label: "ยกเลิก", value: "cancel" },
                { label: "ข้ามเพลง", value: "confirm", variant: "danger" },
            ],
        });
        if (!result || result.action !== "confirm") return;
        await window.api.post(`/api/admin/queue/${id}/skip`, { reason: result.values.reason || null });
    }

    const playNow = async (id) => await window.api.post(`/api/admin/queue/${id}/play`)
    const markPlayed = async (id) => await window.api.post(`/api/admin/queue/${id}/played`)
    const requeue = async (id) => await window.api.post(`/api/admin/queue/${id}/requeue`)
    const removeSong = async (id) => {
        const res = await window.ui.openModal({
            title: "ลบเพลงนี้ออกจากคิว",
            bodyText: 'ลบแล้วจะไม่สามารถกู้คืนได้ ผู้ส่งจะเห็นสถานะเป็น "ข้ามเพลง"',
            fields: [],
            actions: [
                { label: "ยกเลิก", value: "cancel" },
                { label: "ลบเลย", value: "confirm", variant: "danger" },
            ],
        })
        if (!res || res.action !== "confirm") return
        await window.api.post(`/api/admin/queue/${id}/delete`)
    }

    const move = async (id, dir) => {
        if (!latestSnapshot) return
        const ids = latestSnapshot.queue.map((q) => q.id)
        const idx = ids.indexOf(id)
        const newIdx = idx + dir
        if (idx === -1 || newIdx < 0 || newIdx >= ids.length) return
        [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]]
        await window.api.post("/api/admin/queue/reorder", { orderedIds: ids })
    }

    // rendering
    const renderSnapshot = (snap) => {
        latestSnapshot = snap
        applySettingsStatus()

        requestOpenToggle.checked = snap.session.requestOpen
        autoplayToggle.checked = snap.session.autoplay
        capInput.value = snap.session.requestCap
        openTimeInput.value = window.timeUtil.bangkokTimeStr(snap.session.openAt)
        closeTimeInput.value = window.timeUtil.bangkokTimeStr(snap.session.closeAt)

        nowPlayingPanel.innerHTML = snap.nowPlaying
            ? rowHtml(snap.nowPlaying, { nowPlaying: true })
            : '<p class="empty-hint">ยังไม่มีเพลงกำลังเปิด</p>'

        queuePanel.innerHTML = ""
        if (snap.queue.length === 0) queuePanel.innerHTML = '<p class="empty-hint">คิวว่าง</p>'
        else snap.queue.forEach((q) => queuePanel.appendChild(queueRowEl(q)))

        playedPanel.innerHTML =
            snap.played.map((p) => rowHtml(p, { played: true })).join("") ||
            '<p class="empty-hint">ยังไม่มีเพลงที่เปิดแล้ว</p>'

        statQueue.textContent = snap.queue.length
        statPlayed.textContent = snap.played.length

        bindActionButtons()
    }

    const rowHtml = (r, opts = {}) => {
        const cls = opts.played ? "admin-row played" : opts.nowPlaying ? "admin-row now-playing" : "admin-row"
        const badge = r.source === "admin" ? '<span class="badge-pr">PR</span>' : ""
        let action = ""
        if (opts.nowPlaying) {
            action = `<div class="admin-row-actions">
                <button class="row-btn success" data-action="played" data-id="${r.id}" title="เล่นจบแล้ว" aria-label="เล่นจบแล้ว">${ICONS.check}</button>
                <button class="row-btn" data-action="requeue" data-id="${r.id}" title="ย้อนกลับเข้าคิว" aria-label="ย้อนกลับเข้าคิว">${ICONS.requeue}</button>
                <button class="row-btn" data-action="skip" data-id="${r.id}" title="ข้าม" aria-label="ข้าม">${ICONS.skip}</button>
            </div>`
        } else if (opts.played) {
            action = `<div class="admin-row-actions">
                <button class="row-btn" data-action="play" data-id="${r.id}" title="เปิดอีกครั้ง" aria-label="เปิดอีกครั้ง">${ICONS.play}</button>
                <button class="row-btn" data-action="requeue" data-id="${r.id}" title="ย้อนกลับเข้าคิว" aria-label="ย้อนกลับเข้าคิว">${ICONS.requeue}</button>
            </div>`
        }
        return `
        <div class="${cls}">
            <img class="thumb" src="${r.thumbnail}" alt="" loading="lazy" />
            <div class="admin-row-body">
              <div class="admin-row-title">${escapeHtml(r.title || r.youtubeId)}${badge}</div>
              <div class="admin-row-sub">${escapeHtml(r.nickname || "ไม่ระบุชื่อ")}</div>
            </div>
            ${action}
        </div>`
    }

    const queueRowEl = (q) => {
        const div = document.createElement("div")
        div.className = "admin-row"
        div.draggable = true
        div.dataset.id = q.id
        const badge = q.source === "admin" ? '<span class="badge-pr">PR</span>' : ""
        div.innerHTML = `
        <span class="drag-handle" aria-hidden="true">⋮⋮</span>
        <img class="thumb" src="${q.thumbnail}" alt="" loading="lazy" />
        <div class="admin-row-body">
            <div class="admin-row-title">${escapeHtml(q.title || q.youtubeId)}${badge}</div>
            <div class="admin-row-sub">${escapeHtml(q.nickname || "ไม่ระบุชื่อ")}</div>
        </div>
        <div class="admin-row-actions">
            <button class="row-btn" data-action="play" data-id="${q.id}" title="เล่นเพลงนี้" aria-label="เล่นเพลงนี้">${ICONS.play}</button>
            <button class="row-btn" data-action="up" data-id="${q.id}" title="เลื่อนขึ้น" aria-label="เลื่อนขึ้น">${ICONS.up}</button>
            <button class="row-btn" data-action="down" data-id="${q.id}" title="เลื่อนลง" aria-label="เลื่อนลง">${ICONS.down}</button>
            <button class="row-btn" data-action="skip" data-id="${q.id}" title="ข้าม" aria-label="ข้าม">${ICONS.skip}</button>
            <button class="row-btn danger" data-action="delete" data-id="${q.id}" title="ลบ" aria-label="ลบ">${ICONS.trash}</button>
        </div>`

        div.addEventListener("dragstart", () => {
            dragSourceId = q.id
            div.classList.add("dragging")
        })
        div.addEventListener("dragend", () => div.classList.remove("dragging"))
        div.addEventListener("dragover", (e) => e.preventDefault())
        div.addEventListener("drop", async (e) => {
            e.preventDefault()
            if (!dragSourceId || dragSourceId === q.id || !latestSnapshot) return
            const ids = latestSnapshot.queue.map((x) => x.id)
            const from = ids.indexOf(dragSourceId)
            const to = ids.indexOf(q.id)
            if (from === -1 || to === -1) return
            ids.splice(to, 0, ids.splice(from, 1)[0])
            dragSourceId = null
            await window.api.post("/api/admin/queue/reorder", { orderedIds: ids })
        })

        return div
    }

    const bindActionButtons = () => document.querySelectorAll("[data-action]").forEach((btn) => {
        btn.onclick = () => {
            const id = btn.dataset.id
            const action = btn.dataset.action
            if (action === "up") return move(id, -1)
            if (action === "down") return move(id, 1)
            if (action === "play") return playNow(id)
            if (action === "skip") return skip(id)
            if (action === "delete") return removeSong(id)
            if (action === "played") return markPlayed(id)
            if (action === "requeue") return requeue(id)
        }
    })

    // status tab: connections
    const connectionTitle = (c) => {
        if (c.isAdmin) return "ผู้ดูแลระบบ (PR)"
        if (c.deviceId) return "ผู้ใช้ " + c.deviceId.replace(/^dev_/, "").slice(0, 8)
        return "ผู้ใช้ไม่ทราบชื่อ"
    }

    const refreshConnections = async () => {
        let data
        try { data = await window.api.get("/api/admin/connections") }
        catch { connectionsPanel.innerHTML = '<p class="empty-hint">โหลดข้อมูลการเชื่อมต่อไม่สำเร็จ</p>'; return }

        const conns = data.connections || []
        statConnections.textContent = conns.length

        if (conns.length === 0) {
            connectionsPanel.innerHTML = '<p class="empty-hint">ยังไม่มีใครเชื่อมต่ออยู่</p>'
            return
        }

        connectionsPanel.innerHTML = conns.map((c) => `
            <button type="button" class="connection-row" data-conn-device="${c.deviceId ? escapeHtml(c.deviceId) : ""}">
                <span class="connection-dot ${c.isAdmin ? "is-admin" : ""}"></span>
                <span class="connection-body">
                    <div class="connection-title">${escapeHtml(connectionTitle(c))}</div>
                    <div class="connection-sub">เชื่อมต่อ ${relTime(c.connectedAt)}</div>
                </span>
                <span class="connection-meta">${c.deviceId ? `${c.songCount} เพลง` : ""}</span>
            </button>
            <div class="device-panel-slot" data-device-slot="${c.deviceId ? escapeHtml(c.deviceId) : ""}"></div>
        `).join("")

        connectionsPanel.querySelectorAll("[data-conn-device]").forEach((btn) => {
            const deviceId = btn.dataset.connDevice
            if (!deviceId) return
            btn.addEventListener("click", () => toggleDevicePanel(deviceId))
        })

        if (openDevicePanelId) renderDevicePanel(openDevicePanelId)
    }

    const toggleDevicePanel = (deviceId) => {
        openDevicePanelId = openDevicePanelId === deviceId ? null : deviceId
        // clear any other open panel slots
        connectionsPanel.querySelectorAll(".device-panel-slot").forEach((slot) => { slot.innerHTML = "" })
        if (openDevicePanelId) renderDevicePanel(openDevicePanelId)
    }

    const renderDevicePanel = async (deviceId) => {
        const slot = connectionsPanel.querySelector(`.device-panel-slot[data-device-slot="${CSS.escape(deviceId)}"]`)
        if (!slot) return
        slot.innerHTML = '<div class="device-panel"><p class="empty-hint">กำลังโหลด...</p></div>'

        let data
        try { data = await window.api.get(`/api/admin/device/${encodeURIComponent(deviceId)}/requests`) }
        catch { slot.innerHTML = '<div class="device-panel"><p class="empty-hint">โหลดไม่สำเร็จ</p></div>'; return }

        const rows = data.requests || []
        const rowsHtml = rows.length
            ? rows.map((r) => rowHtml(r, r.status === "playing" ? { nowPlaying: true } : r.status === "played" ? { played: true } : {})).join("")
            : '<p class="empty-hint">ผู้ใช้นี้ยังไม่มีคำขอเพลง</p>'

        slot.innerHTML = `
        <div class="device-panel">
            <div class="device-panel-actions">
                <button type="button" class="btn-danger-outline" data-reset-quota="${escapeHtml(deviceId)}">รีเซ็ตโควตาของผู้ใช้นี้</button>
            </div>
            ${rowsHtml}
        </div>`

        slot.querySelector("[data-reset-quota]").addEventListener("click", async () => {
            try {
                await window.api.post("/api/admin/queue/clear", { scope: "user_quota", deviceId })
                window.ui.showToast("รีเซ็ตโควตาแล้ว")
            } catch { window.ui.showToast("รีเซ็ตไม่สำเร็จ ลองอีกครั้ง", "error") }
        })
        bindActionButtons()
    }
})()
