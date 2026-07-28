# YARK CurseForge proxy (Cloudflare Worker)

Holds `CURSEFORGE_API_KEY` on Cloudflare and proxies the official CurseForge Core
API for Ark: Survival Ascended (`gameId` **83374**). The Electron app must call
this Worker — never embed the API key in the client.

Tracked by [#16](https://github.com/gabomarin/yark/issues/16).

## Routes

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Liveness; no secret required |
| `GET` | `/v1/mods/:modId` | Single mod |
| `POST` | `/v1/mods` | Body `{ "modIds": [number, ...] }` |
| `GET` | `/v1/mods/search?...` | Forces `gameId=83374`; pass `searchFilter`, `index`, `pageSize`, etc. |

## Setup

```bash
cd workers/curseforge-proxy
npm install
npx wrangler login
npx wrangler secret put CURSEFORGE_API_KEY
npx wrangler deploy
```

Local dev (optional): copy `.dev.vars.example` → `.dev.vars`, paste the key,
then `npm run dev`.

## Electron

Point `ModsService` at the deployed Worker base URL (app setting / env). Do not
commit secrets.
