(function () {
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
    }
    const STATUS_LABEL = {
        queued: "รอคิว",
        playing: "กำลังเปิด",
        played: "เปิดแล้ว",
        skipped: "ข้ามเพลง"
    }

    function getDeviceId() {
        let id = localStorage.getItem(DEVICE_KEY)
        if (!id) {
            id = "dev_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20)
            localStorage.setItem(DEVICE_KEY, id)
        }
        return id
    }

    function escapeHtml(str) {
        const d = document.createElement("div")
        d.textContent = str == null ? "" : str
        return d.innerHTML
    }

    function relTime(epoch) {
        const diffSec = Math.max(0, Math.floor((Date.now() - epoch) / 1000))
        if (diffSec < 60) return "เมื่อสักครู่"
        const diffMin = Math.floor(diffSec / 60)
        if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
        return `${Math.floor(diffMin / 60)} ชั่วโมงที่แล้ว`
    }

    function statusBadgeHtml(status) { return `<span class="status-badge st-${status}">${STATUS_LABEL[status] || status}</span>` }
    const deviceId = getDeviceId()
    let latestSnapshot = null
    let latestMine = []
    let highlightId = null
    let formBusy = false
    let sessionOpenFlag = false

    const $ = (e) => document.getElementById(e)
    const tabButtons = document.querySelectorAll(".tab-btn")
    const panels = { request: $("panel-request"), me: $("panel-me") }
    const tabMeBadge = $("tab-me-badge")

    const form = $("request-form")
    const urlInput = $("youtube-url")
    const nickInput = $("nickname")
    const submitBtn = $("submit-btn")
    const submitBtnLabel = $("submit-btn-label")
    const formStatus = $("form-status")
    const capNote = $("cap-note")
    const statusLine = $("status-line")

    const mineList = $("mine-list")
    const quotaSummary = $("quota-summary")
    const queueList = $("queue-list")
    const nowPlayingEl = $("now-playing")
    const nowPlayingContextEl = $("now-playing-context")
    const queueWarning = $("queue-warning")
    const recentPlayedCard = $("recent-played-card")
    const recentPlayedList = $("recent-played-list")
    const helpBtn = $("help-btn")

    nickInput.value = localStorage.getItem(NICK_KEY) || ""
    nickInput.addEventListener("input", () => localStorage.setItem(NICK_KEY, nickInput.value.trim()))

    // tabs
    function switchTab(name) {
        Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== name })
        tabButtons.forEach((btn) => {
            const active = btn.dataset.tab === name
            btn.classList.toggle("active", active)
            btn.setAttribute("aria-selected", active ? "true" : "false")
        })
    }

    tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)))

    // help
    function openHelp() {
        window.ui.openInfoModal(
            "วิธีใช้งาน",
            `<p>วางลิงก์ยูทูบแล้วกด "ขอเพลง" ได้เลย การส่งคำขอ<strong>ไม่ได้การันตี</strong>ว่าเพลงจะถูกเปิด ขึ้นอยู่กับดุลยพินิจของ PR และเวลาที่เหลือในช่วงเช้า</p>
            <p>สถานะของคำขอ: รอคิว → กำลังเปิด → เปิดแล้ว หรือ ข้ามเพลง <i>(ขอใหม่ได้ทันที ไม่เสียโควตา)</i></p>
            <p>ดูสถานะคำขอของคุณและโควตาที่เหลือได้ในแท็บ "ของฉัน"</p>`
        )
    }

    helpBtn.addEventListener("click", openHelp)
    if (!localStorage.getItem(HELP_SEEN_KEY)) {
        localStorage.setItem(HELP_SEEN_KEY, "1")
        setTimeout(openHelp, 500)
    }

    function updateSubmitAvailability() { submitBtn.disabled = formBusy || !sessionOpenFlag }
    function setFormBusy(busy) {
        formBusy = busy
        urlInput.disabled = busy
        nickInput.disabled = busy
        submitBtnLabel.innerHTML = busy ? '<span class="spinner"></span> กำลังส่งคำขอ...' : "ขอเพลง"
        updateSubmitAvailability()
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault()
        urlInput.classList.remove("input-error")
        const youtubeUrl = urlInput.value.trim()
        const nickname = nickInput.value.trim()
        localStorage.setItem(NICK_KEY, nickname)
        if (!youtubeUrl) return

        setFormBusy(true)
        formStatus.textContent = "กำลังส่งคำขอ..."
        try {
            const res = await window.api.post("/api/requests", { deviceId, youtubeUrl, nickname: nickname || null })
            highlightId = res.request.id
            urlInput.value = ""
            formStatus.textContent = "ส่งคำขอเรียบร้อยแล้ว"
            window.ui.showToast('ส่งคำขอเรียบร้อยแล้ว ไปดูสถานะที่แท็บ "ของฉัน"')
            await refreshMine()
            switchTab("me")
            setTimeout(() => {
                highlightId = null
                renderMineUI()
            }, 4000)
        } catch (err) {
            const message = ERROR_MESSAGES[err.code] || "ส่งคำขอไม่สำเร็จ ลองอีกครั้งนะ"
            formStatus.textContent = message
            urlInput.classList.add("input-error")
            window.ui.showToast(message, "error")
        } finally { setFormBusy(false) }
    })

    // re-data
    async function refreshMine() {
        try {
            const data = await window.api.get(`/api/requests/mine?deviceId=${encodeURIComponent(deviceId)}`)
            latestMine = data.requests
            renderMineUI()
        } catch { }
    }

    function myIdSet() { return new Set(latestMine.map((r) => r.id)) }
    function positionInQueue(id) {
        if (!latestSnapshot) return null
        const idx = latestSnapshot.queue.findIndex((q) => q.id === id)
        return idx === -1 ? null : idx
    }

    // render: req tab
    function applyLiveStatus() {
        if (!latestSnapshot) return
        const status = window.timeUtil.computeLiveStatus(latestSnapshot.session)
        statusLine.className = `status-line ${status.open ? "is-open" : "is-closed"}`
        statusLine.innerHTML = `<span class="status-dot"></span><span>${status.label}</span>`
        sessionOpenFlag = status.open
        updateSubmitAvailability()
    }

    function renderSnapshotUI(snap) {
        applyLiveStatus()
        capNote.textContent = `วันนี้ขอเพลงได้ไม่เกิน ${snap.session.requestCap} เพลงต่อคน`

        nowPlayingEl.innerHTML = snap.nowPlaying
            ? `<img class="thumb" src="${escapeHtml(window.ytThumbnail(snap.nowPlaying.youtubeId))}" alt="" loading="lazy" /><div>${escapeHtml(snap.nowPlaying.title || snap.nowPlaying.youtubeId)}</div>`
            : '<p class="empty-hint">ยังไม่มีเพลงกำลังเปิด</p>'

        const mine = myIdSet()
        queueList.innerHTML = ""
        if (snap.queue.length === 0) queueList.innerHTML = '<p class="empty-hint">คิวว่าง</p>'
        else snap.queue.forEach((q, i) => {
            const row = document.createElement("div")
            const isMine = mine.has(q.id)
            row.className = `queue-row${isMine ? " queue-row-mine" : ""}`
            row.innerHTML = `
                <span class="queue-index">${i + 1}</span>
                <span class="queue-title">${escapeHtml(q.title || q.youtubeId)}${isMine ? '<span class="you-chip">คุณ</span>' : ""}${q.reviewed ? '<span class="reviewed-dot" title="ผ่านการรีวิวแล้ว"></span>' : ""}</span>
                <span class="queue-nick">${escapeHtml(q.nickname || "ไม่ระบุชื่อ")}</span>`
            queueList.appendChild(row)
        })

        if (snap.queue.length >= LONG_QUEUE_THRESHOLD) {
            queueWarning.style.display = "block"
            queueWarning.textContent = `คิวค่อนข้างยาว (${snap.queue.length} เพลง) เพลงที่ขอใหม่อาจไม่ได้เปิดทันภายในเวลารับเพลงวันนี้`
        } else queueWarning.style.display = "none"

        if (snap.played.length === 0) recentPlayedCard.hidden = true
        else {
            recentPlayedCard.hidden = false
            recentPlayedList.innerHTML = snap.played
                .slice(0, 5)
                .map((p) => `
                <div class="recent-played-row">
                    <img class="thumb" src="${escapeHtml(window.ytThumbnail(p.youtubeId))}" alt="" loading="lazy" style="width:40px;height:22px;" />
                    <span>${escapeHtml(p.title || p.youtubeId)}</span>
                </div>`
                ).join("")
        }

        renderNowPlayingContext()
    }

    function renderNowPlayingContext() {
        const queuedMine = latestMine.filter((r) => r.status === "queued")
        let best = null
        queuedMine.forEach((r) => {
            const idx = positionInQueue(r.id)
            if (idx !== null && (best === null || idx < best)) best = idx
        })
        if (best === null) {
            nowPlayingContextEl.hidden = true
            return
        }
        nowPlayingContextEl.hidden = false
        nowPlayingContextEl.textContent = best === 0 ? "เพลงของคุณจะเปิดเป็นเพลงถัดไป" : `เพลงของคุณอยู่ในคิวแต่มี ${best} เพลงก่อนหน้าคุณ`
    }

    // render: me tab
    function renderMineUI() {
        renderQuota()

        mineList.innerHTML = ""
        if (latestMine.length === 0) mineList.innerHTML = '<p class="empty-hint">ยังไม่มีคำขอของคุณในวันนี้</p>'
        else latestMine
            .slice()
            .reverse()
            .forEach((r) => mineList.appendChild(renderMineCard(r)))

        tabMeBadge.hidden = !latestMine.some((r) => r.status === "queued" || r.status === "playing")
        renderNowPlayingContext()
    }

    function renderQuota() {
        const cap = latestSnapshot ? latestSnapshot.session.requestCap : null
        const used = latestMine.filter((r) => r.status === "queued" || r.status === "playing" || r.status === "played").length
        if (cap === null) return quotaSummary.innerHTML = '<div class="skeleton skeleton-line w-40"></div>'

        const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0
        const shortId = deviceId.replace(/^dev_/, "").slice(0, 8)
        quotaSummary.innerHTML = `
        <div class="quota-row">
            <span>${used} / ${cap} เพลง</span>
            <div class="quota-track"><div class="quota-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="hint" style="margin-top:10px">เพลงที่ถูกข้ามหรือซ้ำจะไม่นับรวมในโควตา</div>
        <div class="device-id-row"><span class="device-id-label">เลขอุปกรณ์: </span><span class="device-id-value">${shortId}</span></div>`
    }

    function renderMineCard(r) {
        const div = document.createElement("div")
        div.className = `status-card status-${r.status}${r.id === highlightId ? " is-new" : ""}`
        const subParts = []
        if (r.status === "queued") {
            const idx = positionInQueue(r.id)
            if (idx !== null) subParts.push(idx === 0 ? "คิวถัดไป" : `มี ${idx} เพลงอยู่ก่อนคุณ`)
        }
        if (r.status === "skipped" && r.skipReason) subParts.push(escapeHtml(r.skipReason))
        subParts.push(relTime(r.createdAt))

        div.innerHTML = `
        <img class="thumb" src="${escapeHtml(window.ytThumbnail(r.youtubeId))}" alt="" loading="lazy" />
        <div style="flex:1; min-width:0;">
            <div class="status-song">${escapeHtml(r.title || r.youtubeId)}${r.reviewed ? '<span class="reviewed-dot" title="ผ่านการรีวิวแล้ว"></span>' : ""}</div>
            ${statusBadgeHtml(r.status)}
            <div class="status-sub">${subParts.join(" · ")}</div>
        </div>`
        return div
    }

    // wire up
    function onSnapshot(snap) {
        latestSnapshot = snap
        renderSnapshotUI(snap)
        refreshMine()
    }

    function onInit() {
        const chip = $("admin-device-chip")
        if (chip) {
            const rawId = localStorage.getItem("msq_device_id") || ""
            const short = rawId.replace(/^dev_/, "").slice(0, 8)
            if (short) chip.textContent = short
        }
    }

    window.api.get("/api/state").then(onSnapshot).catch(() => { })
    window.connectEvents(onSnapshot, {
        onDisconnected: () => window.ui.showToast("การเชื่อมต่อขาดหาย กำลังลองใหม่...", "error"),
        onReconnected: () => window.ui.showToast("เชื่อมต่อกลับมาแล้ว"),
    }, { deviceId })

    setInterval(applyLiveStatus, 30000)
    onInit()
})()
