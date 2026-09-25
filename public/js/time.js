(function () {
    function bangkokParts(epoch) {
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Bangkok",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).formatToParts(new Date(epoch))
        const get = (type) => parts.find((p) => p.type === type).value
        return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") }
    }

    function bangkokTimeStr(epoch) {
        const p = bangkokParts(epoch)
        return `${p.hour}:${p.minute}`
    }

    function bangkokTimeToEpochToday(hhmm) {
        const [h, m] = hhmm.split(":").map(Number)
        const today = bangkokParts(Date.now())
        const iso = `${today.year}-${today.month}-${today.day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`
        return new Date(iso).getTime()
    }

    function computeLiveStatus(session) {
        const now = Date.now()
        if (!session.requestOpen) return { open: false, label: "ปิดรับคำขอชั่วคราว (ปิดโดย PR)" }
        if (now < session.openAt) return { open: false, label: `ยังไม่เปิดรับ, เปิด ${bangkokTimeStr(session.openAt)} น.` }
        if (now > session.closeAt) {
            return { open: false, label: `ปิดรับคำขอแล้ว (ปิดเมื่อ ${bangkokTimeStr(session.closeAt)} น.)` }
        }
        return { open: true, label: `เปิดรับถึง ${bangkokTimeStr(session.closeAt)} น.` }
    }

    window.timeUtil = { bangkokTimeStr, bangkokTimeToEpochToday, computeLiveStatus }
})()
