# [songs thatako [dot] net](https://songs.thatako.net)

morning song queue / student request + PR control

- `public/` static frontend `(vercel)` / es modules, no build *(yet)*
- `worker/` api `(cloudflare worker + d1 + durable object)`

## local dev

```bash
# api :8787 + web :5173 (first run: setup auto)
npm run dev
# same / phone on same wifi -> http://<pc-ip>:5173
npm run dev:lan
```
