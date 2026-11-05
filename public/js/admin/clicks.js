import { delegate } from "../lib/dom.js"
import { markPlayed, move, playNow, removeSheet, requeue, toggleReview } from "./actions.js"
import { togglePreview } from "./cards.js"
import { openDeviceModal } from "./device.js"
import { songById, state } from "./state.js"

// handler
export function initClicks() {
    delegate(document, "click", "[data-device]", (chip) => openDeviceModal(chip.dataset.device))
    delegate(document, "click", "[data-act]", (btn) => {
        if (btn.disabled) return
        const host = btn.closest("[data-id]")
        const onair = btn.closest("#admin-onair")
        const r = onair ? state.snap && state.snap.nowPlaying : host && songById(host.dataset.id)
        if (!r) return

        switch (btn.dataset.act) {
            case "preview": return togglePreview(host, r)
            case "review": return toggleReview(r)
            case "play": case "replay": return playNow(r)
            case "up": return move(r.id, -1)
            case "down": return move(r.id, 1)
            case "remove": return removeSheet(r)
            case "played": return markPlayed(r)
            case "requeue": return requeue(r)
        }
    })
}
