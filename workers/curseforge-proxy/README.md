# YARK CurseForge proxy (Cloudflare Worker)

Holds `CURSEFORGE_API_KEY` on Cloudflare and proxies the official CurseForge Core
API for Ark: Survival Ascended (`gameId` **83374**). The Electron app must call
this Worker — never embed the API key in the client.

Tracked by [#16](https://github.com/gabomarin/yark/issues/16). Abuse controls,
rate limits, caching, and the operator runbook: [#70](https://github.com/gabomarin/yark/issues/70)
and [docs/curseforge-proxy.md](../../docs/curseforge-proxy.md).

## Routes

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Liveness; no secret required |
| `GET` | `/v1/mods/:modId` | Single ASA mod (normalized); edge-cached ~10 min |
| `POST` | `/v1/mods` | Body `{ "modIds": [number, ...] }` (maximum 50, body ≤ 16 KiB) → ASA-only items + skipped |
| `GET` | `/v1/mods/search?...` | Forces `gameId=83374`; filters non-ASA; `pageSize` ≤ 50; edge-cached ~60s |
| `GET` | `/v1/categories?...` | Forces `gameId=83374`; optional `classId` / `classesOnly`; edge-cached ~6h |

Wrong methods on known paths return `405`. Route-class IP rate limits return
`429` / `rate_limited`. Successful GET responses include `X-Yark-Cache: HIT|MISS`.

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
`/description?stripped=true` on **GET** `/v1/mods/:id` for **all** ASA mods
(#342); on **POST** batch **only for Maps-category** mods to avoid N+1 quota
burn (#195); `null` on search), `thumbnailUrl`, `screenshots` (capped HTTPS
URLs from Get Mod, no blobs; may be empty), `authors`, `downloadCount`,
`dateModified`, `curseforgeUrl`, `slug`, `categories`

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

Allow-listed query params (forwarded upstream): `searchFilter`, `classId`,
`categoryId`, `slug`, `sortField`, `sortOrder`, `index`, `pageSize`.

### `GET /v1/categories` → `data`

```json
{
  "categories": [
    {
      "id": 0,
      "name": "string",
      "slug": "string",
      "isClass": true,
      "classId": null,
      "parentCategoryId": null,
      "displayIndex": 0
    }
  ]
}
```

IDs are CurseForge-owned (live `/v1/categories?gameId=83374`). Do not invent
class/category IDs in the app or docs beyond a recorded live response.

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

Upstream fetches use `redirect: "manual"` and only follow HTTPS hops that stay on
`api.curseforge.com` (no open redirects or HTTPS→HTTP downgrades that could leak the API key).

Or set the secret in the Cloudflare dashboard (Workers → Settings → Variables).

Local dev (optional): copy `.dev.vars.example` → `.dev.vars`, paste the key,
then `npm run dev`.

## Electron

`ModsService` resolves the Worker base URL from runtime
`YARK_CURSEFORGE_PROXY_URL`, then the build-injected official URL (release
packages), then **none** (fail closed). There is no committed project-owned
`workers.dev` fallback (#151). Do not commit secrets. Expect `{ ok, data }` /
`{ ok: false, error }` — map into `ModMetadata` cache as-is.
