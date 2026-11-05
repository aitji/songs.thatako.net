## backend

cloudflare worker

* https://api.songs.thatako.net/api/health (*)
* https://api.songs.thatako.net/api/requests (POST) `{deviceId, youtubeUrl, nickname?, note?, turnstileToken}`
* https://api.songs.thatako.net/api/state (GET)
* https://api.songs.thatako.net/api/events (GET)
* https://api.songs.thatako.net/api/requests/mine (GET)
* https://api.songs.thatako.net/api/requests/:id/update (POST) `{deviceId, nickname?, note?}`
* https://api.songs.thatako.net/api/requests/:id/remove (POST) `{deviceId}`

* https://api.songs.thatako.net/api/admin/login (POST) `{password, turnstileToken}`
* https://api.songs.thatako.net/api/admin/me (GET)
* https://api.songs.thatako.net/api/admin/logout (POST)

* https://api.songs.thatako.net/api/admin/settings (POST)
* https://api.songs.thatako.net/api/admin/settings/reset (POST)
* https://api.songs.thatako.net/api/admin/queue/add (POST)
* https://api.songs.thatako.net/api/admin/queue/reorder (POST) `{orderedIds}`
* https://api.songs.thatako.net/api/admin/queue/clear (POST) `{scope, deviceId?}`
* https://api.songs.thatako.net/api/admin/queue/:id/(skip|play|played|delete|requeue) (POST)
* https://api.songs.thatako.net/api/admin/queue/:id/review (POST) `{reviewed?}`
* https://api.songs.thatako.net/api/admin/device/dev_[DEVICE_ID]/requests (GET)

secrets: `ADMIN_PASSWORD` `SESSION_SECRET` `TURNSTILE_SECRET` (`npx wrangler secret put <NAME>`)
local: `npm run dev` (needs `.dev.vars`, see `.dev.vars.example`)

deploy with `cd worker; npm run deploy`