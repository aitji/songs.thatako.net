export const thDateStr = (date: Date = new Date()): string => // yyyy-mm-dd
    new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date)

export const thDate = (hhmm: string, base: Date = new Date()): number => {
    const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10))
    const iso = `${thDateStr(base)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`
    return new Date(iso).getTime()
}
