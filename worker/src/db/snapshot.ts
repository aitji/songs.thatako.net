import type { PublicRequest, SongRequest, StateSnapshot } from "../types"
import { getPlayed, getPlaying, getQueue } from "./queue"
import { ensureSession } from "./sessions"

export const toPublic = (r: SongRequest, deviceId?: string, includePrivate = false): PublicRequest => {
    const mine = !!deviceId && r.deviceId === deviceId
    return {
        id: r.id,
        youtubeId: r.youtubeId,
        title: r.title,
        channel: r.channel,
        nickname: r.nickname,
        status: r.status,
        source: r.source,
        skipReason: r.skipReason,
        reviewed: r.reviewed,
        quotaExempt: r.quotaExempt,
        createdAt: r.createdAt,
        playedAt: r.playedAt,
        ...(deviceId ? { mine } : {}),
        ...(includePrivate || mine ? { note: r.note } : {}),
        ...(includePrivate ? { deviceId: r.deviceId } : {}),
    }
}

export const buildSnapshot = async (db: D1Database, sessionId: string, version: number): Promise<StateSnapshot> => {
    const session = await ensureSession(db, sessionId)
    const [queue, played, nowPlaying] = await Promise.all([
        getQueue(db, sessionId),
        getPlayed(db, sessionId),
        getPlaying(db, sessionId),
    ])
    const full = (r: SongRequest) => toPublic(r, undefined, true)

    return {
        version,
        session: {
            id: session.id,
            openAt: session.openAt,
            closeAt: session.closeAt,
            requestCap: session.requestCap,
            requestOpen: session.requestOpen,
            autoplay: session.autoplay,
            serverTime: Date.now(),
        },
        nowPlaying: nowPlaying ? full(nowPlaying) : null,
        queue: queue.map(full),
        played: played.map(full),
    }
}

const stripOne = (r: PublicRequest): PublicRequest => {
    const { deviceId, note, ...rest } = r
    return rest
}

export const stripPrivate = (snap: StateSnapshot): StateSnapshot => ({
    ...snap,
    nowPlaying: snap.nowPlaying ? stripOne(snap.nowPlaying) : null,
    queue: snap.queue.map(stripOne),
    played: snap.played.map(stripOne),
})
