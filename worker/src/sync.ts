import type { Env, StateSnapshot } from "./types"
import { buildSnapshot, maybeAutoAdvance } from "./db"

// durable object
export const roomOf = (env: Env, sessionId: string): DurableObjectStub =>env.MORNING_ROOM.get(env.MORNING_ROOM.idFromName(sessionId))

const readRoom = async (stub: DurableObjectStub): Promise<StateSnapshot> =>
    (await (await stub.fetch("https://do/state")).json()) as StateSnapshot

const writeRoom = (stub: DurableObjectStub, snap: StateSnapshot): Promise<Response> =>
    stub.fetch("https://do/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snap),
    })

// room empty / stale day
export const ensureSnapshot = async (env: Env, sessionId: string): Promise<StateSnapshot> => {
    const stub = roomOf(env, sessionId)
    const current = await readRoom(stub)
    if (current.session.id === sessionId) return current

    const fresh = await buildSnapshot(env.DB, sessionId, (current.version ?? 0) + 1)
    await writeRoom(stub, fresh)
    return fresh
}

export const bumpAndSync = async (env: Env, sessionId: string): Promise<StateSnapshot> => {
    const stub = roomOf(env, sessionId)
    const nextVer = ((await readRoom(stub)).version ?? 0) + 1

    await maybeAutoAdvance(env.DB, sessionId)
    const snapshot = await buildSnapshot(env.DB, sessionId, nextVer)
    await writeRoom(stub, snapshot)
    return snapshot
}
