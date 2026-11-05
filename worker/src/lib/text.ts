import { DEVICE_MAX } from "../config"

export const cleanText = (v: unknown, max: number): string | null => {
    if (typeof v !== "string") return null
    return v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || null
}

export const cleanDevice = (v: unknown): string | null => typeof v === "string" && v.length > 0 && v !== "admin" ? v.slice(0, DEVICE_MAX) : null
export const newId = (prefix = "id"): string => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`
