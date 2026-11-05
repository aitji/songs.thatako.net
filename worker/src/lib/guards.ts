import { YEAR_2100_MS } from "../config"

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
export const isEpoch = (v: unknown): v is number => isNum(v) && v > 0 && v < YEAR_2100_MS
export const isStr = (v: unknown): v is string => typeof v === "string"
