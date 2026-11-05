import { $ } from "../lib/dom.js"
import { api } from "../core/api.js"
import { connectEvents } from "../core/sse.js"
import { KEYS, store } from "../core/store.js"
import { hydrateIcons } from "../lib/icons.js"
import { openInfoModal } from "../lib/modal.js"
import { showToast } from "../lib/toast.js"
import { startAgoTicker } from "../lib/text.js"
import { initThemeToggle } from "../lib/themeToggle.js"
import { initForm } from "./form.js"
import { initManage, refreshMine } from "./manage.js"
import { renderLiveStatus, renderMine, renderSnapshot } from "./render.js"
import { initLeaveGuard } from "./rows.js"
import { onChange, setHighlight, setSnapshot } from "./state.js"

// helper
const HELP_HTML = `<p>วางลิงก์ยูทูบแล้วกด "ขอเพลง" การส่งคำขอ<strong>ไม่ได้การันตี</strong>ว่าเพลงจะถูกเปิด ขึ้นอยู่กับดุลยพินิจของ PR และเวลาที่เหลือในช่วงเช้า</p>
    <p><strong>สถานะ:</strong> รอคิว > กำลังเปิด > เปิดแล้ว หรือ ข้ามเพลง (ขอใหม่ได้ทันที ไม่เสียโควตา) ป้าย "ผ่านรีวิว" คือ PR ตรวจเพลงนี้แล้ว</p>
    <p><strong>จัดการคำขอของคุณ:</strong> แก้ชื่อหรือข้อความถึง PR ได้ และลบเพลงที่ยังรอคิวได้ที่แท็บ "ของฉัน" เพลงที่กำลังเปิดหรือเปิดแล้วลบไม่ได้</p>
    <p><strong>ข้อความถึง PR</strong> เห็นเฉพาะ PR คนอื่นไม่เห็น</p>`
const openHelp = () => openInfoModal("วิธีใช้งาน", HELP_HTML)

const panels = { request: $("panel-request"), me: $("panel-me") }
const tabButtons = document.querySelectorAll(".tab-btn")

function switchTab(name) {
    Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== name })
    tabButtons.forEach((btn) => {
        const active = btn.dataset.tab === name
        btn.classList.toggle("active", active)
        btn.setAttribute("aria-selected", active ? "true" : "false")
    })
    window.scrollTo({ top: 0 })
}

// boot
hydrateIcons()
initThemeToggle()
startAgoTicker()
initLeaveGuard()
initManage()

tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)))
document.querySelectorAll("[data-seg]").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll("[data-seg]").forEach((b) => b.setAttribute("aria-selected", b === btn ? "true" : "false"))
    document.querySelectorAll("[data-seg-panel]").forEach((p) => { p.hidden = p.dataset.segPanel !== btn.dataset.seg })
}))

$("help-btn").addEventListener("click", openHelp)
if (!store.get(KEYS.help)) {
    store.set(KEYS.help, "1")
    setTimeout(openHelp, 500)
}

const form = initForm({
    onSent: async (req) => {
        setHighlight(req.id)
        await refreshMine()
        switchTab("me")
        setTimeout(() => setHighlight(null), 4000)
    },
})

const renderAll = () => { renderLiveStatus(); renderSnapshot(); renderMine(); form.refresh() }
onChange(renderAll)

const onSnapshot = (snap) => { setSnapshot(snap); refreshMine() }
api.get("/api/state").then(onSnapshot).catch(() => { })
connectEvents(onSnapshot, {
    onDisconnected: () => showToast("การเชื่อมต่อขาดหาย กำลังลองใหม่...", "error"),
    onReconnected: () => showToast("เชื่อมต่อกลับมาแล้ว"),
})
setInterval(() => { renderLiveStatus(); form.refresh() }, 30000) // open/close clock
