(function () {
    const BASE = window.CONFIG.API_BASE
    const handle = async (res) => {
        let data = null
        try { data = await res.json() }
        catch {/* no body */ }

        if (!res.ok) {
            const err = new Error((data && data.error) || `http_${res.status}`)
            err.status = res.status
            err.code = data && data.error
            throw err
        }
        return data
    }

    const apiGet = async (path) => {
        const res = await fetch(BASE + path, { credentials: "include" })
        return handle(res)
    }

    const apiPost = async (path, body) => {
        const res = await fetch(BASE + path, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
        })
        return handle(res)
    }

    window.api = { get: apiGet, post: apiPost }
})()
