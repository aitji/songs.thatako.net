const SRC = "https://www.youtube.com/iframe_api"
const TIMEOUT = 15000

let loading = null
export const loadYT = () => {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
    if (loading) return loading

    loading = new Promise((resolve, reject) => {
        const fail = () => { loading = null; reject(new Error("yt_api_load_failed")) }
        const timer = setTimeout(fail, TIMEOUT)
        const prev = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => {
            clearTimeout(timer)
            if (typeof prev === "function") prev()
            resolve(window.YT)
        }
        const s = document.createElement("script")
        s.src = SRC
        s.async = true
        s.onerror = () => { clearTimeout(timer); fail() }
        document.head.appendChild(s)
    })
    return loading
}
