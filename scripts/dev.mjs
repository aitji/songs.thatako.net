import { spawn, spawnSync } from "node:child_process"
import { copyFileSync, existsSync } from "node:fs"

const lan = process.argv.includes("--lan")
const run = (cmd, opts = {}) => spawn(cmd, { stdio: "inherit", shell: true, ...opts })

if (!existsSync("worker/node_modules")) {
    console.log("installing worker deps...")
    spawnSync("npm install", { cwd: "worker", stdio: "inherit", shell: true })
}

if (!existsSync("worker/.dev.vars")) {
    copyFileSync("worker/.dev.vars.example", "worker/.dev.vars")
    console.log("created worker/.dev.vars (admin password = dev)")
}

if (!existsSync("worker/.wrangler/state")) {
    console.log("creating local db...")
    spawnSync("npm run db:local", { cwd: "worker", stdio: "inherit", shell: true })
}

const procs = [
    run(lan ? "npm run dev:lan" : "npm run dev", { cwd: "worker" }),
    run("node scripts/serve.mjs", { env: { ...process.env, HOST: lan ? "0.0.0.0" : "localhost" } }),
]
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0) }
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
procs.forEach((p) => p.on("exit", (code) => { if (code) stop() }))
