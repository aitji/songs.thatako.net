import { $ } from "../lib/dom.js"
import { api } from "../core/api.js"
import { connectEvents } from "../core/sse.js"
import { KEYS, store } from "../core/store.js"
import { hydrateIcons } from "../lib/icons.js"
import { openInfoModal, openModal } from "../lib/modal.js"
import { showToast } from "../lib/toast.js"
import { startAgoTicker } from "../lib/text.js"
import { applyThemePick, initThemeToggle, themeField } from "../lib/themeToggle.js"
import { initForm } from "./form.js"
import { initManage, refreshMine } from "./manage.js"
import { renderLiveStatus, renderMine, renderSnapshot } from "./render.js"
import { initLeaveGuard } from "./rows.js"
import { onChange, setHighlight, setSnapshot } from "./state.js"

// helper
const HELP_HTML =`
<div>
    <p>วางลิงก์ยูทูบแล้วกด "ขอเพลง", การส่งคำขอ<strong>ไม่ได้การันตี</strong>ว่าเพลงจะถูกเปิด ขึ้นอยู่กับดุลยพินิจของ PR และเวลาที่เหลือในช่วงเช้า</p>
    <dl>
        <strong>ข้อมูลที่ควรรู้:</strong>
        <dd><b>คำขอเพลง:</b> ทุกคนที่ใช้งานเว็บไซต์จะเห็น คำขอเพลงของคุณทั้งเพลงที่ อยู่ในคิว, กำลังเล่น และเล่นไปแล้ว</dd>
        <dd><b>ชื่อเล่น:</b> <i>(หากระบุชื่อ)</i> ทุกคนที่ใช้งานเว็บไซต์จะสามารถตรวจสอบได้ว่าคุณขอเพลงใด</dd>
        <dd><b>ข้อความถึง PR:</b> <i>(หากระบุข้อความ)</i> เฉพาะ PR เท่านั้นที่สามารถเข้าถึงข้อความแนบนี้ได้ /ผู้ใช้งานอื่นไม่สามารถเข้าถึงได้</dd>
    </dl>
    <dl>
        <strong>ป้ายสถานะที่อาจพบเห็น:</strong>
        <dd><b>รอคิว</b>: คำขอของคุณยังไม่ได้ถูกตรวจสอบ แต่ไม่ได้หมายความว่าจะไม่ได้ถูกเปิดนะ</dd>
        <dd><b>ผ่านรีวิว</b>: PR ตรวจเพลงนี้แล้ว</dd>
        <dd><b>กำลังเปิด</b>: เพลงกำลังเปิดในตอนนี้</dd>
        <dd><b>เปิดแล้ว</b>: เพลงได้เปิดไปแล้ว</dd>
        <dd><b>ถูกข้าม:</b>: ตามดุลยพินิจของ PR เห็นว่าเพลงไม่สมควรเปิด <i>(จะมีเหตุผลบอก)</i></dd>
    </dl>
    <p><strong>จัดการคำขอของคุณ:</strong> หลังจากขอเพลงแล้วคุณสามารถแก้<b>ชื่อเล่นหรือข้อความ</b> และยังสามารถ<b>ลบเพลง</b> <b>ที่ยังรอคิวอยู่</b> ได้ที่แท็บ <b>ของฉัน</b> <i>/เพลงที่กำลังเปิดหรือเปิดแล้วลบไม่ได้</i></p>
</div>`
const openHelp = () => openInfoModal("วิธีใช้งาน", HELP_HTML)
const openWelcome = () => openModal({
    title: "ยินดีต้อนรับ",
    bodyHtml: HELP_HTML,
    fields: [{ ...themeField(), label: "เลือกธีมที่ชอบ (เปลี่ยนทีหลังได้ที่ปุ่มมุมขวาบน)" }],
    actions: [{ label: "เข้าใจแล้ว", value: "ok", variant: "primary" }],
    onChange: applyThemePick,
})

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
    setTimeout(openWelcome, 500)
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
