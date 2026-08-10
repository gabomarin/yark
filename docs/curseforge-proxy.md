# CurseForge proxy — abuse controls and operations

Operator runbook for the Cloudflare Worker in
[`workers/curseforge-proxy`](../workers/curseforge-proxy/). Tracks
[#70](https://github.com/gabomarin/yark/issues/70). Setup and route shapes:
[Worker README](../workers/curseforge-proxy/README.md).

## Threat model

The proxy is **public and unauthenticated**. The CurseForge Overwolf API key
lives only as a Worker secret. Anyone who can reach the `workers.dev` URL can
call the same routes the Electron app uses.

A desktop `installId` or Worker-minted JWT would be **copyable** and cannot prove
a caller is a genuine YARK install. Treat any future token as a **quota handle**,
never identity or attestation.

### What abuse looks like

- Sustained valid bounded requests (search / read / batch) that burn CurseForge
  quota or Worker CPU/subrequests.
- Oversized bodies or long-hanging upstream calls (mitigated by body/time bounds).
- Unsupported routes/methods (rejected).

### What we do not claim

- Client authentication or binary attestation.
- Per-install identity.
- Global (cross-PoP) hard caps — Workers Rate Limiting is **per Cloudflare
  location**.

## Baseline controls (deployed)

| Control | Behavior |
| --- | --- |
| Input bounds | Batch ≤ 50 mod IDs; search `pageSize` ≤ 50; `searchFilter` ≤ 200 chars; validated index |
| Body limit | POST body ≤ 16 KiB → `413` / `body_too_large` |
| Upstream timeout | 10s abort → `504` / `upstream_timeout` |
| Rate limits | Route-class IP limits via Workers Rate Limiting bindings (below) |
| Cache | Cache API on successful GET read (10 min) and search (60s); `X-Yark-Cache: HIT\|MISS` |
| Errors | Sanitized envelope; API key / bearer redacted; wrong method → `405` |

### Rate-limit defaults (assumptions — tune after measurement)

| Route class | Binding | Limit / period | Key |
| --- | --- | --- | --- |
| search | `RATE_LIMIT_SEARCH` | 30 / 60s | `search:<CF-Connecting-IP>` |
| read | `RATE_LIMIT_READ` | 60 / 60s | `read:<CF-Connecting-IP>` |
| batch | `RATE_LIMIT_BATCH` | 20 / 60s | `batch:<CF-Connecting-IP>` |

Deny → `429` / `rate_limited` (same code clients already see for upstream 429).

## Assumed traffic (until measured)

Normal Mods workspace use (per install / short session), **assumptions**:

- Discover search: a handful of GETs while typing (debounced in UI when present).
- Detail / thumbnail refresh: occasional GET by Project ID.
- Profile open / metadata refresh: one POST batch (≤ enabled+disabled IDs, capped
  at 50 by the Worker).
- Maps-category mods may trigger an extra upstream `/description` on cache MISS
  (get/batch only).

Documented alert thresholds to start from (operators refine with real logs):

- Sustained `rate_limited` (edge) or upstream `429` for >5 minutes.
- Elevated `upstream_timeout` / `502` share vs baseline.
- Unexpected spike in `search` vs `read`/`batch` ratio.

## Observability

Each request (including denials) emits one JSON log line via `console.log`:

```json
{
  "service": "yark-curseforge-proxy",
  "routeClass": "search",
  "method": "GET",
  "status": 200,
  "latencyMs": 42,
  "cache": "HIT",
  "upstreamStatus": null,
  "rateLimited": false
}
```

**Never logged:** CurseForge API key, bearer tokens, `searchFilter` text, full
client IPs, or request bodies.

```bash
cd workers/curseforge-proxy
npm run tail
```

Also use the Cloudflare dashboard Workers analytics for request volume and
errors. Correlate with `X-Yark-Cache` when debugging upstream exposure.

## Cache rules

| Route | Cached? | TTL | Cache key |
| --- | --- | --- | --- |
| `GET /v1/mods/:id` | Yes (HTTP 200 only) | 600s | Synthetic origin + path |
| `GET /v1/mods/search` | Yes (HTTP 200 only) | 60s | Allow-listed query params only (same as upstream) |
| `POST /v1/mods` | No | — | — |
| Errors / rate limits | No | — | — |

Edge `Cache-Control` is for Cache API TTL only. Client responses always get
`Cache-Control: no-store` plus `X-Yark-Cache: HIT|MISS` (HIT and MISS behave the
same for clients).

## Emergency procedures

### Temporary tighten or disable

1. **Tighten limits** — edit `[[ratelimits]]` in
   [`wrangler.toml`](../workers/curseforge-proxy/wrangler.toml) (lower `limit`
   or shorten via `period` 10/60 only), then `npm run deploy`.
2. **Kill traffic** — Cloudflare dashboard → Workers → `yark-curseforge-proxy` →
   pause/disable the Worker, or deploy a stub that returns `503` for `/v1/*`
   while keeping `/health`.
3. **Rollback** — redeploy the previous known-good Worker version from the
   dashboard version history or git tag.

Electron can use a different base URL via runtime `YARK_CURSEFORGE_PROXY_URL`
or a rebuilt package with a different baked URL; see
[Electron endpoint ownership](#electron-endpoint-ownership-151) below.

## Electron endpoint ownership (#151)

The CurseForge proxy URL is **public configuration**, not a secret. It must not
appear as a committed runtime fallback in source.

### Precedence

1. Runtime `YARK_CURSEFORGE_PROXY_URL` (maintainer/dev automation).
2. Official URL baked at `electron-vite build` from Actions
   `vars.YARK_CURSEFORGE_PROXY_URL` (release packages).
3. **None** — metadata search / refresh / new-ID validation fail closed with an
   actionable “metadata service is not configured” message. Existing mod IDs and
   launch `-mods=` still work; cached metadata may remain visible.

The Electron client never accepts a CurseForge API key.

### Official release injection

1. Repo **Settings → Secrets and variables → Actions → Variables**: set
   `YARK_CURSEFORGE_PROXY_URL` to the Worker base URL (no trailing slash required).
2. `.github/workflows/release.yml` fails the package job if the variable is empty
   or not `https://…`, then passes it into `npm run build` so main embeds
   `__YARK_CURSEFORGE_PROXY_URL__`.
3. Local/`npm run build` without that env leaves an empty bake (fail closed unless
   runtime `YARK_CURSEFORGE_PROXY_URL` is set).

### Local / Cursor development

Windows User env vars are easy to miss: terminals inside Cursor inherit the IDE’s
environment from when Cursor started, so a newly set User variable may not appear
until you fully quit and reopen Cursor (or set the var in that shell).

Preferred local setup:

1. Copy [`.env.example`](../.env.example) → `.env.local` (gitignored).
2. Set `YARK_CURSEFORGE_PROXY_URL` to your Worker base URL (same value as the
   Actions variable is fine).
3. Restart `npm run dev` or `npm run start` — `electron.vite.config.ts` loads
   `.env` / `.env.local` into `process.env` before bake and before Electron starts.

### Migration and retirement (operator)

Keep the legacy Worker that **0.5.1** embeds while older installs remain in use.

1. Ensure #70 abuse controls are live on the Worker that will become “official”.
2. Set `vars.YARK_CURSEFORGE_PROXY_URL` (same hostname first is fine) and ship a
   release that bakes it — confirm the installer has no silent source fallback.
3. When ready, point the variable at a replacement hostname and cut a release.
4. On the legacy Worker: tighten rate limits, then return an actionable upgrade
   response (for example `410 Gone` with upgrade copy) for `/v1/*` while keeping
   `/health` for diagnostics.
5. After the compatibility window: delete the old Worker and rotate the CurseForge
   API key if traffic/logs suggest abuse.

### Secret rotation

1. Create a new CurseForge / Overwolf API key in the provider console.
2. `cd workers/curseforge-proxy && npx wrangler secret put CURSEFORGE_API_KEY`
   (paste the new key).
3. Confirm `/health` and a single `GET /v1/mods/<knownId>` succeed.
4. Revoke the old provider key.
5. If the old key may have leaked, treat as incident: tighten rate limits and
   review `wrangler tail` for anomalous volume.

## Token layer (explicitly deferred)

`installId` / registration / short-lived JWT is **not** implemented. Revisit
only if measured abuse or operational needs justify per-install quotas or ban
lists. If adopted later:

- Rate-limit registration itself.
- Mint/sign/verify only on the Worker.
- Rate-limit by IP **plus** claimed install ID.
- Treat the ID/token as a quota handle, never attestation.
- Define expiry, rotation, replay, clock-skew, and unavailable-registration
  behavior in this doc before shipping.

## Deploy checklist

```bash
cd workers/curseforge-proxy
npm install
npx wrangler secret put CURSEFORGE_API_KEY   # first deploy / rotation only
npm run deploy
```

Smoke: `GET /health`, search, single mod, batch, and an intentional rate-limit
trip (burst). Revisit thresholds after several days of `npm run tail` / CF
analytics.
