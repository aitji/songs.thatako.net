export const KEYS = {
    device: "msq_device_id",
    nick: "msq_nickname",
    help: "msq_seen_help",
    adminHelp: "msq_admin_seen_help",
    theme: "msq_theme",
    client: "msq_admin_client",
    speakerPref: "msq_speaker_pref",
    speakerVol: "msq_speaker_vol",
}

export const store = {
    get(key) {
        try { return localStorage.getItem(key) }
        catch { return null }
    },
    set(key, value) {
        try { localStorage.setItem(key, value) }
        catch { /* ignore */ }
    },
}
