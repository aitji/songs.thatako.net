const enc = new TextEncoder()
const hmacKey = (secret: string): Promise<CryptoKey> =>crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])

// b64url
const toB64u = (bytes: ArrayBufferLike): string => {
    let bin = ""
    new Uint8Array(bytes).forEach((b) => (bin += String.fromCharCode(b)))
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const fromB64u = (str: string): Uint8Array => {
    const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4))
    const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

// sign / verify
export const adminToken = async (secret: string, ttlMs: number): Promise<string> => {
    const b64 = toB64u(enc.encode(JSON.stringify({ exp: Date.now() + ttlMs })).buffer)
    const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(b64))
    return `${b64}.${toB64u(sig)}`
}

export const verifyAdminToken = async (token: string, secret: string): Promise<boolean> => {
    const [b64, sigB64] = token.split(".")
    if (!b64 || !sigB64) return false
    try {
        const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64u(sigB64), enc.encode(b64))
        if (!valid) return false
        const payload = JSON.parse(new TextDecoder().decode(fromB64u(b64)))
        return typeof payload.exp === "number" && payload.exp > Date.now()
    } catch { return false }
}
