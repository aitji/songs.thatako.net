# songs.thatako.net

morning song queue / student request + PR control

- `public/` static frontend (vercel) / es modules, no build
- `worker/` api (cloudflare worker + d1 + durable object)

## local dev (no cors)

```bash
npm run dev          # api :8787 + web :5173 (first run: setup auto)
npm run dev:lan      # same / phone on same wifi -> http://<pc-ip>:5173
```

- web -> http://localhost:5173 / pr -> http://localhost:5173/pr (password `dev`)
- frontend picks api by hostname (`public/js/core/config.js`): localhost / lan -> local worker `:8787` / else prod
- worker `DEV=1` (in `worker/.dev.vars`, never deployed) -> cors allows localhost + lan origins, cookie non-secure
- local db = `.wrangler/state` / reset: delete folder + `npm --prefix worker run db:local`
- local frontend -> prod api = blocked by cors on purpose (use local worker)
- open via `http://` (not `file://`) / es modules need server

## turnstile (anti spam)

- sitekey in `public/js/core/config.js` (prod) / local uses cloudflare test key (always pass)
- protects: song request (`action=request`) + pr login (`action=login`)
- theme follows site theme (re-render on switch)
- worker secret: `cd worker; npx wrangler secret put TURNSTILE_SECRET`
- secret unset -> captcha skipped (warn in log) / set -> required
- local test secret in `worker/.dev.vars.example`

## theme

`client` (follow device) > `light` > `dark` / button in topbar / saved in `localStorage.msq_theme`
tokens in `public/css/theme.css`

## layout

```
public/js
  boot.js          theme pre-paint
  core/            config api sse time store theme turnstile
  lib/             dom text icons youtube modal toast urlfield themeToggle
  app/             student page (state render form preview manage)
  admin/           pr page (state cards render drag settings addsong ...)
public/css         theme base components overlay admin
worker/src
  index.ts         entry (cors + router)
  http/            cors ctx router
  routes/          public admin
  db/              sessions requests queue snapshot
  lib/             text time youtube token cookie guards
  auth.ts turnstile.ts sync.ts morningRoom.ts config.ts types.ts
```
