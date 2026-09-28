window.CONFIG = {
    API_BASE: "https://api.songs.thatako.net",
}

const YT_ID_SAFE_RE = /^[a-zA-Z0-9_-]{11}$/
window.ytThumbnail = function (youtubeId) {
    if (typeof youtubeId !== "string" || !YT_ID_SAFE_RE.test(youtubeId)) return ""
    return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
}