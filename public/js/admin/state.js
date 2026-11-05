// share stuff

export const state = {
    snap: null,
    pending: null,
    dragging: false,
    previewId: null,
    settingsDirty: false,
}

export const songById = (id) => {
    const s = state.snap
    if (!s) return null
    return s.queue.find((q) => q.id === id)
        || (s.nowPlaying && s.nowPlaying.id === id ? s.nowPlaying : null)
        || s.played.find((p) => p.id === id)
        || null
}

export const isStale = (snap, cur) => !!cur && cur.session.id === snap.session.id && snap.version < cur.version
