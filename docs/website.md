# Project website (GitHub Pages)

Public product site and operator docs for YARK server manager.

**Live:** [https://gabomarin.github.io/yark/](https://gabomarin.github.io/yark/)

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
| `website/src/pages/` | Marketing routes (`/`, `/faq/`, `/changelog/`) |
| `website/src/content/docs/docs/` | Starlight docs under `/docs/` |
| `website/public/` | Favicons, logo, screenshots |
| `website/astro.config.mjs` | `base: "/yark"`, Starlight sidebar, dark-only theme; remark plugin prefixes content `/docs/…` links with that base |
| `.github/workflows/pages.yml` | Build Astro → deploy `website/dist` |

## Local preview

```bash
cd website
npm install
npm run dev
```

Open **http://localhost:4321/yark/** (base path matches GitHub project Pages).

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

**One-time repo setup:** Settings → Pages → Source = **GitHub Actions**.

After deploy, submit `https://gabomarin.github.io/yark/sitemap-index.xml` in Search Console
when you care about SEO indexing.

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
