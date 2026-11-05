import { $ } from "../lib/dom.js"
import { api } from "../core/api.js"
import { connectEvents } from "../core/sse.js"
import { KEYS, store } from "../core/store.js"
import { hydrateIcons } from "../lib/icons.js"
import { openInfoModal } from "../lib/modal.js"
import { showToast } from "../lib/toast.js"
import { shortDevice, startAgoTicker } from "../lib/text.js"
import { initThemeToggle } from "../lib/themeToggle.js"
import { initAddSong } from "./addsong.js"
import { initAuth } from "./auth.js"
import { initClicks } from "./clicks.js"
import { initDrag } from "./drag.js"
import { onSnapshot } from "./render.js"
import { initSettings } from "./settings.js"

//helpers
const HELP_HTML = `<p><strong>การ์ดเพลงในคิว</strong> ปุ่มซ้าย ⋮⋮ ลากเพื่อสลับลำดับ (ลากได้ทั้งเมาส์และนิ้ว) และ ▲▼ เลื่อนทีละขั้น</p>
    <p>แตะรูปเพื่อดูตัวอย่าง (เปิดได้ทีละเพลง) แตะชื่อเพลงเพื่อเปิดใน YouTube วงกลมหน้าชื่อคือ "ตรวจแล้ว" ใช้ทำเครื่องหมายว่าฟังแล้วผ่าน</p>
    <p><strong>เล่นเลย</strong> ตั้งเพลงนี้เป็นเพลงที่กำลังเปิด ถ้ามีเพลงอื่นเปิดอยู่ เพลงนั้นจะถูกย้ายไปท้ายคิว</p>
    <p><strong>✕ มุมขวาบน</strong> เลือกได้ว่าจะ "ข้ามเพลง" (ผู้ขอเห็นสถานะและเหตุผล) หรือ "ลบทิ้ง" (หายไปจากรายการของผู้ขอ)</p>
    <p><strong>แถบเหลือง</strong> คือข้อความที่ผู้ขอฝากถึง PR คนอื่นไม่เห็น</p>
    <p><strong>แท็บประวัติ</strong> ดูเพลงที่เล่นแล้ว เปิดซ้ำหรือย้ายกลับเข้าคิวได้</p>`
const openHelp = () => openInfoModal("วิธีใช้งานห้องควบคุม", HELP_HTML)

const panels = { queue: $("panel-queue"), history: $("panel-history"), settings: $("panel-settings") }
const tabButtons = document.querySelectorAll(".tab-btn")

function switchTab(name) {
    Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== name })
    tabButtons.forEach((btn) => {
        const active = btn.dataset.tab === name
        btn.classList.toggle("active", active)
        btn.setAttribute("aria-selected", active ? "true" : "false")
    })
}

// after logon
function onAuthed() {
    $("login-section").style.display = "none"
    $("panel-section").style.display = "block"

    const short = shortDevice(store.get(KEYS.device))
    if (short) $("admin-device-chip").textContent = short
    else $("admin-device-chip").hidden = true

    api.get("/api/state").then(onSnapshot).catch(() => { })
    connectEvents(onSnapshot, {
        onDisconnected: () => showToast("การเชื่อมต่อขาดหาย กำลังลองใหม่...", "error"),
        onReconnected: () => showToast("เชื่อมต่อใหม่แล้ว"),
    })

    if (!store.get(KEYS.adminHelp)) {
        store.set(KEYS.adminHelp, "1")
        setTimeout(openHelp, 500)
    }
}

// boot
hydrateIcons()
initThemeToggle()
startAgoTicker()
initSettings()
initAddSong()
initClicks()
initDrag()

tabButtons.forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)))
$("help-btn").addEventListener("click", openHelp)
initAuth({ onAuthed })
