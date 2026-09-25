# Release download counter — operations

Operator runbook for the Cloudflare Worker in
[`workers/release-downloads`](../workers/release-downloads/). Setup and route
shapes: [Worker README](../workers/release-downloads/README.md).

## What it counts

Sum of `download_count` for GitHub Release assets whose name ends in `.exe`,
across all releases of `GITHUB_REPOSITORY` (`[vars]`, default `gabomarin/yark`).

- **Counted:** the installer (`YARK-server-manager-Setup-{version}.exe`) and any
  future `.exe` asset (e.g. a portable build).
- **Not counted:** `.exe.blockmap`, `latest.yml`, `.sha256`, `.dmg`, `.zip`, and
  any other asset type Shields' built-in `github/downloads` badge would add.

GitHub's `download_count` is **batch-updated** and can lag hours behind real
downloads. The count is also only as fresh as the last cron run. Do not describe
it as real-time.

## Why not Shields' built-in badge

`github/downloads/{owner}/{repo}/total` sums every asset in every release, so it
inflates the number with delta maps and update manifests that are not installs.
Shields has no extension filter, and its `dynamic/json` query (JSONPath) cannot
sum across releases — hence this Worker.

## Data flow

1. `scheduled()` (cron `17 */6 * * *`, every 6h) pages GitHub Releases
   (`per_page=100`), sums `.exe` downloads, and writes `exe` + `updatedAt` to KV.
2. `GET /` reads KV and returns `{ downloads, updatedAt }`.

KV is the **last good value**: if GitHub is down or rate-limited, `refresh()`
throws before writing, so the endpoint keeps serving the previous count. KV
(not D1) is deliberate — this is one integer, not a dataset.

## Consumers

| Consumer      | How it reads                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Shields badge | `https://img.shields.io/badge/dynamic/json?url=<worker-url>/&query=$.downloads&label=.exe%20downloads`                                        |
| getyark.com   | client-side `fetch(<worker-url>/)`; the site is static (Astro/Pages) so a build-time fetch would freeze the number until the next site deploy |

The endpoint sends `Access-Control-Allow-Origin: *` for the website fetch.
Shields fetches server-side and needs no CORS.

## Forcing a recount

The Cloudflare dashboard has **no "run now"** on the Cron Triggers page — it
only creates/edits schedules and lists the last 100 Cron Events. There is a
"Trigger scheduled event" button inside the **Quick Edit** editor, but it is
known to be unreliable (greyed out or spinning) and Cloudflare closed the
feature request for a dashboard button as _not planned_. Adding a Cron Trigger
also takes up to 15 minutes to propagate, so tweaking the schedule is not a
workaround.

Instead, `GET /refresh?token=…` calls the same `refresh()` path as the cron:

```bash
curl "https://<worker-url>/refresh?token=$REFRESH_TOKEN"
```

- Requires the `REFRESH_TOKEN` secret; the route is `404` when it is unset or
  the token does not match (`safeEqual`, constant-time).
- Returns the fresh `{ downloads, updatedAt }` with `Cache-Control: no-store`,
  or `502` if GitHub fails (KV keeps the previous value).
- Local equivalent: `npx wrangler dev --test-scheduled`, then
  `curl "http://localhost:8787/__scheduled?cron=17%20*/6%20*%20*%20*"`.

## Rate limits and the optional token

Unauthenticated GitHub API is 60 req/h **per IP**, and Worker egress IPs are
shared. The cron makes ≤ 20 requests per run (at 6h cadence that is far under
the limit), but a shared-IP collision can still return `403`.

If that happens, add a fine-grained read-only token:

```bash
cd workers/release-downloads
npx wrangler secret put GITHUB_TOKEN
```

`refresh()` only sends it when present. No token is required for a public repo.

## Deploy checklist

```bash
cd workers/release-downloads
npm install
npx wrangler kv namespace create DOWNLOADS   # paste id into wrangler.toml
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN         # optional (see above)
```

Smoke: `GET /` returns JSON. To seed a value before the first cron run, use the
Cloudflare dashboard → Workers → KV, or trigger the schedule from the dashboard.

Optional: attach a custom domain (e.g. `api.getyark.com`) to the Worker so the
public URL is not `*.workers.dev`. Same Cloudflare account as the Pages project.
