const bangkokParts = (epoch) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(epoch))
    const get = (type) => parts.find((p) => p.type === type).value
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") }
}

// yyyy-mm-dd
export const bangkokDateStr = (epoch = Date.now()) => {
    const p = bangkokParts(epoch)
    return `${p.year}-${p.month}-${p.day}`
}

export const bangkokTimeStr = (epoch) => {
    const p = bangkokParts(epoch)
    return `${p.hour}:${p.minute}`
}

// "hh:mm" to epoch
export const bangkokTimeToEpochToday = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number)
    const t = bangkokParts(Date.now())
    const pad = (n) => String(n).padStart(2, "0")
    return new Date(`${t.year}-${t.month}-${t.day}T${pad(h)}:${pad(m)}:00+07:00`).getTime()
}

// open/closed status pill
export const computeLiveStatus = (session) => {
    const now = Date.now()
    if (!session.requestOpen) return { open: false, label: "ปิดรับคำขอชั่วคราว" }
    if (now < session.openAt) return { open: false, label: `จะเปิดรับเมื่อ ${bangkokTimeStr(session.openAt)} น.` }
    if (now > session.closeAt) return { open: false, label: `ปิดรับคำขอเมื่อ ${bangkokTimeStr(session.closeAt)} น.` }
    return { open: true, label: `เปิดรับถึง ${bangkokTimeStr(session.closeAt)} น.` }
}
