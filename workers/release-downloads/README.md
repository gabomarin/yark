# YARK release download counter (Cloudflare Worker)

Counts **installer downloads only** across YARK's GitHub Releases and exposes
them as public JSON. Two consumers read the same endpoint:

- a **Shields badge** (`/badge/dynamic/json` renders it — this Worker returns JSON, not SVG);
- **getyark.com**, which fetches it client-side.

It exists because Shields' built-in `github/downloads/...` badge sums *every*
release asset, including `.blockmap`, `.yml`, and `.sha256` — not real installs.

Runbook, cache rules, and deploy checklist: [docs/release-downloads.md](../../docs/release-downloads.md).

## Routes

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/` | `{ "downloads": number, "updatedAt": string \| null }`; `Access-Control-Allow-Origin: *`, `max-age=300` |
| `GET` | `/refresh?token=…` | Forces a recount and returns the fresh JSON. `404` unless `REFRESH_TOKEN` is set and matches. `no-store`. |
| — | cron | `scheduled()` recounts from GitHub and writes KV; see `docs/release-downloads.md` |

## Setup

```bash
cd workers/release-downloads
npm install
npx wrangler login
npx wrangler kv namespace create DOWNLOADS   # paste the id into wrangler.toml
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN         # optional; only if rate-limited
npx wrangler secret put REFRESH_TOKEN        # optional; enables GET /refresh
```

## Forcing a recount

The dashboard has **no "run now"** for cron triggers (Cloudflare closed that
request as _not planned_; the Quick Edit trigger button is unreliable). To
recount on demand after a deploy or a release:

```bash
curl "https://<worker-url>/refresh?token=$REFRESH_TOKEN"
```

Without `REFRESH_TOKEN` the route returns `404` (off by default). Local:
`npx wrangler dev --test-scheduled` exposes `/__scheduled` for the same purpose.

`GITHUB_REPOSITORY` (`owner/repo`) lives in `[vars]` — public info, safe to
commit. The GitHub token is a **secret**, not a var, and only needed if the
unauthenticated 60 req/h limit becomes a problem (Worker IPs are shared).

Local dev: `npm run dev`, then `GET http://localhost:8787/`.

## Badge

```
https://img.shields.io/badge/dynamic/json?url=<worker-url>/&query=$.downloads&label=.exe%20downloads&color=brightgreen
```

Shields fetches server-side, so no CORS is needed for the badge. getyark.com
does need it, which is why the endpoint sends `Access-Control-Allow-Origin: *`.
