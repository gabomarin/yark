# YARK server manager

**Work in progress.** YARK server manager is a Windows desktop application for managing local dedicated ARK: Survival Ascended servers. Features will be added, changed, or refined as development continues — treat the current build as an evolving preview, not a finished product.

**Project site (temporary GitHub Pages):** [https://gabomarin.github.io/yark/](https://gabomarin.github.io/yark/)

## What it supports today

- Manage multiple server profiles from a single app.
- Start, stop, restart, and force-stop server instances.
- Install and update server files with SteamCMD.
- Create backups, restore them, configure schedule/retention, and review operation history.
- Inspect runtime, update, and backup logs.
- Review cluster state and RCON status from the interface.
- Manage CurseForge mod Project IDs per server (`-mods=`) from the Server form. A dedicated Mods tab is deferred until a CurseForge API key is available.

## Current status

Core flows already work (profiles, process control, SteamCMD install/update, backups, logs, INI editing). The UI is being migrated to a cleaner Electron + React + TypeScript shell:

- Shared shell and navigation are active.
- Overview, SteamCMD, Logs, Backups, and Server Workspace (INI editor) use the new renderer.
- Clusters and Settings pages are still placeholders inside the new shell.
- End-to-end validation against real ASA binaries and SteamCMD on a production host is still ongoing.

Expect gaps, rough edges, and behavior changes between builds.

## Repository layout

- `src/main` — Electron main process
- `src/preload` — secure IPC bridge for the renderer
- `src/renderer` — React/TypeScript UI
- `src/backend` — domain logic, services, process management, persistence
- `src/shared` — shared contracts and types

## Requirements

- Windows (to run the desktop app)
- Node.js 20+ (a recent version compatible with Electron/Vite)
- npm

## Local development

```bash
npm install
npm run dev
```

```bash
npm test
npm run typecheck
npm run build
npm run package
```

> On WSL or non-native shells, verification is often more reliable via `cmd.exe /c` when Rollup or Electron optional dependencies misbehave.

## Project website (GitHub Pages)

The temporary public site lives in [`website/`](website/) and deploys via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

Expected URL: [https://gabomarin.github.io/yark/](https://gabomarin.github.io/yark/)

**One-time GitHub setup**

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (required once; the workflow 404s until this exists).
3. Push `website/` + the workflow to `main`, or re-run **Deploy GitHub Pages** under the Actions tab.
4. Confirm the site loads at the URL above.

If the workflow still fails on `configure-pages` with “Get Pages site failed / Not Found”, the Source is still not set to GitHub Actions. The workflow also passes `enablement: true` so it can create the Pages site when the token is allowed to do so.

Edit `website/index.html` (and `styles.css`) for copy updates; pushes that touch `website/**` redeploy the page.

## Agent / assistant context

For AI-assisted work in this repo, see:

- [docs/agent-context.md](docs/agent-context.md)
- [.github/copilot-instructions.md](.github/copilot-instructions.md)
- [docs/visual-testing.md](docs/visual-testing.md) before changing visible renderer UI
- [docs/versioning.md](docs/versioning.md) and [CHANGELOG.md](CHANGELOG.md) for SemVer and release notes

Project status and history live in [CHANGELOG.md](CHANGELOG.md) (and the WIP notes in this README). There is no tracked `TODO.md`.
