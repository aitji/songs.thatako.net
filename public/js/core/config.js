const LOCAL_HOST_RE = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/
export const IS_LOCAL = LOCAL_HOST_RE.test(location.hostname)

export const API_BASE = IS_LOCAL
    ? `http://${location.hostname}:8787`
    : "https://api.songs.thatako.net"

export const TURNSTILE_SITEKEY = IS_LOCAL
    ? "1x00000000000000000000AA"
    : "0x4AAAAAAFzJAsqrRPzaQRHp"
