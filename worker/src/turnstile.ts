import type { Env } from "./types"

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const TOKEN_MAX = 2048

export type CaptchaResult = "ok" | "skipped" | "missing" | "failed"
let warned = false

export const checkTurnstile = async (env: Env, token: unknown, ip: string, action: string): Promise<CaptchaResult> => {
    if (!env.TURNSTILE_SECRET) {
        if (!warned) { warned = true; console.warn("TURNSTILE_SECRET not set -> captcha OFF") }
        return "skipped"
    }
    if (typeof token !== "string" || !token || token.length > TOKEN_MAX) return "missing"

    const form = new FormData()
    form.set("secret", env.TURNSTILE_SECRET)
    form.set("response", token)
    if (ip !== "unknown") form.set("remoteip", ip)

    try {
        const res = await fetch(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(5000) })
        const data = (await res.json()) as { success?: boolean; action?: string }
        if (!data.success) return "failed"
        return !data.action || data.action === action ? "ok" : "failed"
    } catch { return "failed" }
}

export const captchaError = (r: CaptchaResult): string | null =>
    r === "ok" ||
        r === "skipped"
        ? null : r === "missing"
            ? "captcha_required"
            : "captcha_failed"
