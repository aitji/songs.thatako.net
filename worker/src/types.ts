export interface Env {
    DB: D1Database
    MORNING_ROOM: DurableObjectNamespace
    ADMIN_PASSWORD: string
    SESSION_SECRET: string
    ALLOWED_ORIGIN?: string
}

export type RequestStatus = "queued" | "playing" | "played" | "skipped"
export type RequestSource = "student" | "admin"
export type ClearScope = "played" | "queued" | "both" | "user_quota"

export interface SongRequest {
    id: string
    sessionId: string
    deviceId: string
    youtubeId: string
    title: string | null
    channel: string | null
    nickname: string | null
    status: RequestStatus
    source: RequestSource
    position: number | null
    skipReason: string | null
    quotaExempt: boolean
    createdAt: number
    updatedAt: number
    playedAt: number | null
    skippedAt: number | null
}

export interface SessionSettings {
    id: string
    openAt: number
    closeAt: number
    requestCap: number
    requestOpen: boolean
    autoplay: boolean
    createdAt: number
}

export interface PublicRequest {
    id: string
    youtubeId: string
    title: string | null
    channel: string | null
    thumbnail: string
    nickname: string | null
    status: RequestStatus
    source: RequestSource
    skipReason: string | null
    createdAt: number
    mine?: boolean
    deviceId?: string
}

export interface StateSnapshot {
    version: number
    session: {
        id: string
        openAt: number
        closeAt: number
        requestCap: number
        requestOpen: boolean
        autoplay: boolean
        serverTime: number
    }
    nowPlaying: PublicRequest | null
    queue: PublicRequest[]
    played: PublicRequest[]
}

export interface ConnectionInfo {
    connId: string
    connectedAt: number
    isAdmin: boolean
    deviceId: string | null
}
