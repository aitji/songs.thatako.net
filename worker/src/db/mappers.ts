import type { SessionSettings, SongRequest } from "../types"

type Row = Record<string, any>
export const rowToSession = (row: Row): SessionSettings => ({
    id: row.id,
    openAt: row.open_at,
    closeAt: row.close_at,
    requestCap: row.request_cap,
    requestOpen: !!row.request_open,
    autoplay: !!row.autoplay,
    createdAt: row.created_at,
})

export const rowToRequest = (row: Row): SongRequest => ({
    id: row.id,
    sessionId: row.session_id,
    deviceId: row.device_id,
    youtubeId: row.youtube_id,
    title: row.title,
    channel: row.channel,
    nickname: row.nickname,
    note: row.note ?? null,
    status: row.status,
    source: row.source,
    position: row.position,
    skipReason: row.skip_reason,
    quotaExempt: !!row.quota_exempt,
    reviewed: !!row.reviewed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    playedAt: row.played_at,
    skippedAt: row.skipped_at,
})
