# YARK CurseForge proxy (Cloudflare Worker)

Holds `CURSEFORGE_API_KEY` on Cloudflare and proxies the official CurseForge Core
API for Ark: Survival Ascended (`gameId` **83374**). The Electron app must call
this Worker — never embed the API key in the client.

Tracked by [#16](https://github.com/gabomarin/yark/issues/16).

## Routes

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Liveness; no secret required |
| `GET` | `/v1/mods/:modId` | Single ASA mod (normalized) |
| `POST` | `/v1/mods` | Body `{ "modIds": [number, ...] }` (maximum 50) → ASA-only items + skipped |
| `GET` | `/v1/mods/search?...` | Forces `gameId=83374`; filters non-ASA; `pageSize` is limited to 50 |

## Response envelope

Success:

```json
{ "ok": true, "data": { /* endpoint payload */ } }
```

Error (never includes the API key):

```json
{ "ok": false, "error": { "code": "not_asa_mod", "message": "..." } }
```

### `GET /v1/mods/:id` → `data`

Normalized mod (`ModMetadata`-shaped):

`id`, `name`, `summary`, `description` (plain text, truncated; from CurseForge
`/description?stripped=true` on get/batch **only for Maps-category mods**;
`null` for other mods and on search), `thumbnailUrl`, `authors`,
`downloadCount`, `dateModified`, `curseforgeUrl`, `slug`, `categories`

Non-ASA projects → `404` / `not_asa_mod`.

### `POST /v1/mods` → `data`

```json
{
  "items": [ /* YarkModMetadata[] */ ],
  "skipped": [{ "id": "123", "reason": "not_asa_mod" }]
}
```

### `GET /v1/mods/search` → `data`

```json
{
  "items": [ /* YarkModMetadata[] ASA-only */ ],
  "pagination": { "index": 0, "pageSize": 50, "resultCount": 10, "totalCount": 100 }
}
```

## Setup

Tunables live in `wrangler.toml` `[vars]` (`ASA_GAME_ID`, `CORS_ALLOW_ORIGIN`).
The CurseForge API key is a **secret**, not a var.

```bash
cd workers/curseforge-proxy
npm install
npx wrangler login
npx wrangler secret put CURSEFORGE_API_KEY
npx wrangler deploy
```

Or set the secret in the Cloudflare dashboard (Workers → Settings → Variables).

Local dev (optional): copy `.dev.vars.example` → `.dev.vars`, paste the key,
then `npm run dev`.

## Electron

`ModsService` calls this Worker (default base URL =
`https://yark-curseforge-proxy.gabomarin26.workers.dev`). Override with env
`YARK_CURSEFORGE_PROXY_URL` or the `curseforgeProxyUrl` app setting. Do not
commit secrets. Expect `{ ok, data }` / `{ ok: false, error }` — map into
`ModMetadata` cache as-is.
