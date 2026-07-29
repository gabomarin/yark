# Project website (GitHub Pages)

Temporary public project page for YARK server manager. Static HTML/CSS under
[`website/`](../website/) — no build step. Live URL:
[https://gabomarin.github.io/yark/](https://gabomarin.github.io/yark/)

## Intent

- Give contributors and reviewers a short product overview without cloning the app.
- Show current UI via a small screenshot gallery (`#screenshots`).
- Stay honest that early builds are a **public prerelease** (GitHub Releases), not a
  finished / production-ready product.

This is **not** the desktop app’s renderer. Do not put Electron/React runtime
docs here; keep engineering runbooks under [`docs/`](./).

## Layout

| Path | Role |
| --- | --- |
| `website/index.html` | Copy, sections, screenshot markup |
| `website/styles.css` | Dark theme, hero, showcase grid, sections |
| `website/screenshots/*.png` | Versioned feature screenshots |
| `.github/workflows/pages.yml` | Deploy on `main` when `website/**` (or the workflow) changes |

Section order in `index.html` today: hero → showcase (`#screenshots`) → scope /
roadmap / not / privacy / mods / security / about → footer.

## Deploy workflow

Workflow: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)

- Triggers: `push` to `main` with path filters `website/**` or
  `.github/workflows/pages.yml`, plus `workflow_dispatch`.
- Artifact root: `website` (uploaded as-is by `actions/upload-pages-artifact`).
- Permissions: `contents: read`, `pages: write`, `id-token: write`.
- Concurrency group `pages` cancels in-progress deploys.

**One-time repo setup**

1. GitHub → **Settings → Pages**.
2. **Build and deployment → Source** = **GitHub Actions** (required once).
3. Push or re-run **Deploy GitHub Pages**.

If `configure-pages` fails with “Get Pages site failed / Not Found”, Source is
still not GitHub Actions. The workflow passes `enablement: true` so the site can
be created when the token allows it.

Local preview: open `website/index.html` in a browser, or serve the folder
statically (for example `npx --yes serve website`). No `npm` script is required.

## Screenshot gallery

Markup lives in `website/index.html` inside `<section class="showcase" id="screenshots">`.
Styles: `.showcase`, `.shots` (2-column grid; 1-column under `720px`), `.shot`.

### Current assets

| File | Screen shown |
| --- | --- |
| `overview.png` | Servers overview (profiles, status, activity) |
| `workspace-server.png` | Server form (identity, ports, access, cluster) |
| `workspace-mods.png` | Mods tab (Project IDs, enable/disable, CurseForge metadata) |
| `workspace-ini.png` | Visual INI editor (`GameUserSettings.ini`) |
| `workspace-backups.png` | Per-server Backups tab (destination, schedule, history) |
| `configuration-wizard.png` | Configuration assistant (six-step wizard) |
| `backups.png` | Sidebar Backups page (health, disk, destinations across servers) |
| `clusters.png` | Clusters compliance (`clusterId` / shared directory) |
| `logs.png` | Sidebar Logs (problems / activity across servers) |
| `settings.png` | Settings (SteamCMD path, base folder, preferences) |

Images are linked for full-size open (`target="_blank"`). Declared dimensions in
HTML are `1440 × 900` (capture viewport used for the initial set).

Refresh captures with `npm run build` then `npm run website:screenshots`
(`scripts/capture-website-screenshots.cjs`). That script cleans leftover `E2E-*`
profiles, prefers existing renamed servers, seeds a demo only when empty,
configures a shared Cluster ID + directory on up to three servers for the
Clusters shot (skips gracefully if fewer than two profiles), and redacts
`Users\<name>` paths in Settings before capture.

### Capture tooling requirements

- **OS:** Windows preferred (Electron GUI). Linux desktops can capture shell
  chrome; install paths may look non-production.
- **Node:** 22.5+ (same as the app; see `package.json` `engines`).
- **Playwright:** already listed under `devDependencies` (`playwright`). Electron
  e2e uses Playwright’s `_electron` API from that package — no separate
  `@playwright/test` browser install is required for these scripts. After
  `npm install`, run `npm run build`, then unset `ELECTRON_RUN_AS_NODE` if set.
- **Optional env:** `WEBSITE_SCREENSHOT_OUT`, `WEBSITE_DEMO_SERVER`,
  `WEBSITE_DEMO_INSTALL_DIR`, `WEBSITE_DEMO_MOD_IDS`, `WEBSITE_DEMO_CLUSTER_ID`,
  `WEBSITE_DEMO_CLUSTER_DIR`, `WEBSITE_VIEWPORT_WIDTH` / `HEIGHT`. Defaults use
  `C:\ARK\...` on Windows and `os.tmpdir()/yark-gallery/...` elsewhere.
  Mods e2e: `E2E_MODS_ID`, `E2E_MODS_INSTALL_ROOT`.

### When to refresh

Update screenshots when a **user-visible** shell or featured surface changes
enough that the public page misrepresents the app (navigation, major layout,
new primary flows). Skip for copy-only or behind-the-scenes backend changes.

These PNGs are **product references**, not Playwright visual-test artifacts.
Ephemeral review shots stay in temp dirs per [visual-testing.md](visual-testing.md).

### Capture checklist

1. Build and launch a real Electron window (`npm run build` then `npm start`, or
   `npm run dev`). Unset `ELECTRON_RUN_AS_NODE` if set.
2. Prefer Windows (or a Windows-capable GUI host). Linux cloud desktops can
   capture the shell for docs, but path/SteamCMD chrome may look non-production.
3. Use a content viewport near **1440 × 900** so new shots match existing aspect
   ratio and `width`/`height` attributes. Crop to the window client area (no OS
   chrome).
4. Seed enough demo data: multiple profiles for overview; at least one server for
   workspace; INI editor with searchable settings; sidebar Backups with a
   destination/health row when possible.
5. **Redact secrets.** Admin/RCON passwords and other credentials must not appear
   in committed images (see the Security note on the site itself).
6. Overwrite the matching file under `website/screenshots/`, or add a new PNG and
   a matching `<figure class="shot">` block (image + descriptive `alt` +
   `figcaption`).
7. Keep captions short and accurate; update roadmap/scope copy in the same PR if
   a screenshot implies a status change (for example Backups is live — do not
   list it as a placeholder).

### Adding or removing a shot

1. Add/remove the PNG under `website/screenshots/`.
2. Add/remove the `<figure class="shot">` in `index.html` (keep lazy-loaded
   `img`, useful `alt`, and caption).
3. Prefer an even count so the 2-column grid stays balanced; odd counts are fine
   but leave a trailing single cell on wide viewports.

## Copy and version surfaces

- Preview version in the hero (`status-pill`, e.g. `v0.1.0`) is **hardcoded** in
  `website/index.html`. It does **not** read `package.json`. When bumping the app
  version for a release people will see on the site, update the pill in the same
  change set (see [versioning.md](versioning.md)).
- Scope and roadmap lists are editorial; keep them aligned with
  [README.md](../README.md) and [agent-context.md](agent-context.md). As of v0.3.0,
  Mods tab + Settings are live; Clusters compliance and Sidebar/Workspace Backups
  are live. Prefer “deeper CurseForge browsing” on the roadmap — not “Mods not
  integrated yet.”

## Constraints and pitfalls

- Path-filtered deploy: edits only under `docs/` do **not** redeploy Pages.
  Screenshot or copy changes must touch `website/**` (or the workflow file).
- Relative asset URLs (`./styles.css`, `./screenshots/...`) assume the site is
  served from the Pages root for this project. Do not move assets without
  updating hrefs.
- Large PNGs inflate the repo; prefer compressed screenshots at the capture size
  rather than 4K dumps.
- Do not commit real player data, install paths that expose private usernames, or
  live passwords in gallery images.
- Visual regression of the **desktop app** still follows
  [visual-testing.md](visual-testing.md) at HD / Full HD / QHD — that protocol is
  separate from refreshing this gallery.

## Related docs

- [README — Project website](../README.md#project-website-github-pages)
- [visual-testing.md](visual-testing.md) — Playwright review of the Electron UI
- [versioning.md](versioning.md) — SemVer / changelog; sync site version pill on release
- [agent-context.md](agent-context.md) — current functional status for accurate copy
