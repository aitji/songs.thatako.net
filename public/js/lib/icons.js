const PATHS = {
    play: '<path d="M7 4.500v15l12.500-7.500z" fill="currentColor" stroke-width="1.500"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g>',
    pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.500 20.500 2 22l1.500-5.500L17 3z"/>',
    note: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    skip: '<path d="M5 5l9 7-9 7z" fill="currentColor"/><path d="M19 5v14"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
    paste: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.500v5.500"/><circle cx="12" cy="16.500" r=".6" fill="currentColor"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.300a2.500 2.500 0 1 1 3.300 2.400c-.9.300-1.300.9-1.300 1.900"/><circle cx="12" cy="16.600" r=".6" fill="currentColor"/>',
    okc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.500l3 3 5-6"/>',
    user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.600 3.100-6 7-6s7 2.400 7 6"/>',

    // theme
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400"/>',
    moon: '<path d="M21 12.800A9 9 0 1 1 11.200 3a7 7 0 0 0 9.800 9.800z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
}

export const icon = (name, size = 18) =>`<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ""}</svg>`
export const hydrateIcons = (root = document) => root
    .querySelectorAll("[data-icon]")
    .forEach((el) => { el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 18) })
