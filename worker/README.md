## backend

cloudflare worker

* https://api.songs.thatako.net/api/health (*)
* https://api.songs.thatako.net/api/requests (POST)
* https://api.songs.thatako.net/api/state (GET)
* https://api.songs.thatako.net/api/events (GET)
* https://api.songs.thatako.net/api/requests/mine (GET)

* https://api.songs.thatako.net/api/admin/login (POST)
* https://api.songs.thatako.net/api/admin/me (GET)
* https://api.songs.thatako.net/api/admin/logout (POST)

* https://api.songs.thatako.net/api/admin/settings (POST)
* https://api.songs.thatako.net/api/admin/settings/reset (POST)
* https://api.songs.thatako.net/api/admin/queue/add (POST)
* https://api.songs.thatako.net/api/admin/queue/reorder (POST)
* https://api.songs.thatako.net/api/admin/queue/skip (POST)
* https://api.songs.thatako.net/api/admin/queue/play (POST)
* https://api.songs.thatako.net/api/admin/queue/played (POST)
* https://api.songs.thatako.net/api/admin/queue/delete (POST)
* https://api.songs.thatako.net/api/admin/queue/clear (POST)
* https://api.songs.thatako.net/api/admin/queue/review (POST)
* https://api.songs.thatako.net/api/admin/queue/device/dev_[DEVICE_ID]/requests (GET)

deploy with `cd worker; npm run deploy`