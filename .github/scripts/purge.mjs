import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"

const DB_NAME = "morning-song-queue"
const local = process.argv.includes("--local")

const retentionDays = Number(process.env.RETENTION_DAYS || "7")
const dryRun = (process.env.DRY_RUN || "false").toLowerCase() === "true"
if (!Number.isInteger(retentionDays) || retentionDays < 0 || retentionDays > 365) {
    console.error("::error::RETENTION_DAYS must be an integer between 0 and 365")
    process.exit(1)
}

const thDateStr = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
const now = Date.now()
const cutoff = thDateStr(new Date(now - retentionDays * 86_400_000))
const loginCutoff = now - 24 * 60 * 60 * 1000

if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff) || !Number.isSafeInteger(loginCutoff)) {
    console.error("::error::bad cutoff computed, aborting")
    process.exit(1)
}

const d1 = (sql) => {
    const out = execFileSync(
        "npx",
        ["wrangler", "d1", "execute", DB_NAME, local ? "--local" : "--remote", "--json", "--command", sql],
        { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 },
    )
    const start = out.search(/^\[/m)
    if (start < 0) throw new Error(`no json in wrangler output:\n${out}`)
    const parsed = JSON.parse(out.slice(start))
    if (!parsed[0]?.success) throw new Error(`d1 query failed:\n${out}`)
    return parsed[0]
}

const counted = d1(`SELECT
    (SELECT COUNT(*) FROM requests WHERE session_id < '${cutoff}') AS requests,
    (SELECT COUNT(*) FROM sessions WHERE id < '${cutoff}') AS sessions,
    (SELECT COUNT(*) FROM login_attempts WHERE window_start < ${loginCutoff}) AS loginAttempts`).results[0]

const result = { cutoff, dryRun, ...counted }

if (!dryRun) {
    d1(`DELETE FROM requests WHERE session_id < '${cutoff}'`)
    d1(`DELETE FROM sessions WHERE id < '${cutoff}'`)
    d1(`DELETE FROM login_attempts WHERE window_start < ${loginCutoff}`)
}

const line = `cutoff=${result.cutoff} dryRun=${result.dryRun} requests=${result.requests} sessions=${result.sessions} loginAttempts=${result.loginAttempts}`
console.log(line)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + "\n")