import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(fileURLToPath(new URL("../public", import.meta.url)))
const PORT = Number(process.env.PORT || 5173)
const HOST = process.env.HOST || "localhost" // 0.0.0.0 = lan

const MIME = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json", ".xml": "application/xml",
    ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".md": "text/plain; charset=utf-8",
}

const resolvePath = async (pathname) => {
    if (pathname.toLowerCase() === "/pr") pathname = "/admin.html"
    if (pathname.endsWith("/")) pathname += "index.html"
    const file = normalize(join(ROOT, decodeURIComponent(pathname)))
    if (file !== ROOT && !file.startsWith(ROOT + sep)) return null
    try { return (await stat(file)).isFile() ? file : null }
    catch { return null }
}

const send = async (res, status, file) => {
    res.writeHead(status, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" })
    res.end(await readFile(file))
}

createServer(async (req, res) => {
    try {
        const file = await resolvePath(new URL(req.url, "http://x").pathname)
        if (file) return await send(res, 200, file)
        await send(res, 404, join(ROOT, "404.html"))
    } catch { res.writeHead(500).end("server error") }
}).listen(PORT, HOST, () => {
    console.log(`web  -> http://localhost:${PORT} (admin: /pr)`)
})
