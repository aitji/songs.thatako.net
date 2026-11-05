import { API_BASE } from "./config.js"

// json / throw {status,code}
const parse = async (res) => {
    const data = await res.json().catch(() => null)
    if (!res.ok) {
        const err = new Error((data && data.error) || `http_${res.status}`)
        err.status = res.status
        err.code = data && data.error
        throw err
    }
    return data
}

const get = async (path) => parse(await fetch(API_BASE + path, { credentials: "include" }))
const post = async (path, body) => parse(await fetch(API_BASE + path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
}))

export const api = { get, post }
