(function () {
    try {
        var t = localStorage.getItem("msq_theme")
        if (t === "light" || t === "dark") document.documentElement.dataset.theme = t
    } catch { /* storage blocked? */ }
})()
