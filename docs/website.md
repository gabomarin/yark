# Project website (GitHub Pages)

Public product site and operator docs for YARK server manager.

**Live:** [https://getyark.com/](https://getyark.com/)

**Source:** [`website/`](../website/) — Astro 7 + Starlight (marketing pages + `/docs/`).

## Intent

- Product overview, screenshots, FAQ, changelog, and download CTA
- Operator documentation (Starlight) distilled from repo runbooks
- Honest prerelease framing (unsigned builds, not production-ready)
- Official-download provenance and SHA-256 verification guidance
- Current local credential/storage boundary without overstating protection

## Layout

| Path | Role |
| --- | --- |
| `website/src/pages/` | Marketing routes (`/`, `/faq/`, `/changelog/`) plus canonical `404.astro` → `dist/404.html` for GitHub Pages |
| `website/src/content/docs/docs/` | Starlight docs under `/docs/` |
| `website/public/` | Favicons, logo, screenshots |
| `website/astro.config.mjs` | `base: "/"`, Starlight sidebar, dark-only theme, `disable404Route: true` (avoid duplicate `/404` with docs catch-all); remark plugin prefixes content `/docs/…` links with that base |
| `.github/workflows/pages.yml` | Build Astro → deploy `website/dist` |

## 404 page

Canonical not-found page: [`website/src/pages/404.astro`](../website/src/pages/404.astro)
→ `website/dist/404.html` (what GitHub Pages serves for missing paths).

Do **not** add `website/src/content/docs/404.md` while Starlight’s docs catch-all
is enabled — that collides with the dedicated `/404` route and reintroduces an
Astro build warning (#149). Starlight’s injected 404 is disabled via
`disable404Route: true`. `npm run build` in `website/` runs
`scripts/assert-canonical-404.mjs` after the Astro build.

## Local preview

```bash
cd website
npm install
npm run dev
```

Open **http://localhost:4321/** (`base: "/"` matches the getyark.com custom domain).

From the repo root: `npm run website:dev` / `npm run website:build`.

## CI

Workflow: [`.github/workflows/website-ci.yml`](../.github/workflows/website-ci.yml)

Runs `npm ci` + `npm run build` in `website/` on pull requests and pushes to `main`,
**only when** paths under `website/**`, root `package.json` (download version), or the
website/Pages workflows change. Unrelated app PRs skip this job.

## Deploy

Workflow: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)

- Triggers: push to `main` touching `website/**`, root `package.json` (version for
  download URL), or the workflow; plus `workflow_dispatch`
- `npm ci` + `npm run build` in `website/`
- Artifact: `website/dist`
- Permissions: `contents: read`, `pages: write`, `id-token: write`

**One-time repo setup:** Settings → Pages → Source = **GitHub Actions**, Custom domain = `getyark.com` (DNS at the registrar; `website/public/CNAME` keeps the domain on deploy).

After deploy, submit `https://getyark.com/sitemap-index.xml` in Search Console
when you care about SEO indexing.

## Analytics (optional)

Privacy-first traffic via [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/)
(no cookie banner required for the default beacon).

1. Cloudflare dashboard → **Web Analytics** → **Add a site** → hostname `getyark.com`
   (JS snippet mode is fine; DNS does not need to move to Cloudflare).
2. Copy the **token** from the beacon snippet (`data-cf-beacon='{"token":"…"}'`).
3. GitHub repo **Settings → Secrets and variables → Actions → Variables** →
   create `PUBLIC_CF_WEB_ANALYTICS_TOKEN` with that token.
4. Redeploy Pages (`workflow_dispatch` on Deploy GitHub Pages, or push a `website/**` change).

Local preview skips the beacon unless you set the same env var when building. The token is
public by design (it ships in HTML); keeping it in a GitHub Actions variable avoids baking
a personal site id into every fork clone.

## Screenshots

Gallery assets live in `website/public/screenshots/`.

```bash
npm run build
npm run website:screenshots
```

Default output is `website/public/screenshots/` (override with `WEBSITE_SCREENSHOT_OUT`).
Requires a prior app `npm run build`, Playwright, and a Windows GUI session.

The capture script **always** launches Electron with an isolated `YARK_E2E_USER_DATA`
temp profile and seeds a public demo fleet there. It never opens your normal app
userData, so private server names/paths cannot leak into marketing shots. See
`scripts/capture-website-screenshots.cjs`.

## Download button

`website/src/data/site.ts` reads the root `package.json` `version` and builds:

`https://github.com/gabomarin/yark/releases/download/v{version}/YARK-server-manager-Setup-{version}.exe`

Bump the app version / cut a matching Release tag so the CTA stays valid. The asset name
must stay in sync with `build.artifactName` in the root `package.json` — see
[versioning.md](versioning.md).

The landing and operator docs must describe the current release trust state consistently:

- while installers are unsigned, keep the SmartScreen warning and SHA-256 verification steps;
- after Authenticode is enabled, replace the unsigned copy across the landing, FAQ, Getting
  started, Docs overview, and Security & privacy in the same release;
- never claim a publisher identity or trusted timestamp until the published installer has been
  verified after download.
