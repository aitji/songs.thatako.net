// session defaults
export const DEFAULT_OPEN = "06:30"
export const DEFAULT_CLOSE = "07:45"
export const DEFAULT_CAP = 2
export const DEFAULT_AUTOPLAY = true
export const MAX_CAP = 20

// admin auth
export const COOKIE_NAME = "pr_session"
export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 12h
export const LOGIN_WINDOW_MS = 10 * 60 * 1000
export const LOGIN_MAX_ATTEMPTS = 8

// player
export const PLAYER_ONLINE_MS = 30 * 1000
export const CLIENT_LABEL_MAX = 40
export const MAX_SEEK_MS = 24 * 60 * 60 * 1000

// limits
export const NICK_MAX = 24
export const NOTE_MAX = 120
export const REASON_MAX = 80
export const DEVICE_MAX = 64
export const URL_MAX = 2048
export const REORDER_MAX = 200
export const DAY_MS = 24 * 60 * 60 * 1000
export const YEAR_2100_MS = 4102444800000
