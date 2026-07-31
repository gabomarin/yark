# YARK server manager

**Work in progress.** YARK server manager is a Windows desktop application for managing local dedicated ARK: Survival Ascended servers. Features will be added, changed, or refined as development continues — treat the current build as an evolving preview, not a finished product.

**Project site (GitHub Pages):** [https://gabomarin.github.io/yark/](https://gabomarin.github.io/yark/)

## What it supports today

- Manage multiple server profiles from a single app.
- Start, stop, restart, and force-stop server instances.
- Install and update server files with SteamCMD.
- Create backups, restore them, configure schedule/retention, and review backup history (plus related events in Logs).
- Inspect runtime, update, and backup logs.
- Review cluster state and RCON status from the interface.
- Manage CurseForge mods per server from the Mods tab: Project IDs, enable/disable without dropping IDs, Worker-backed metadata, and launch-time `-mods=` for enabled mods only.

## Current status

Core flows already work (profiles, process control, SteamCMD install/update, backups, logs, INI editing, Mods, Settings). The UI lives in an Electron + React + TypeScript shell:

- Shared shell and navigation are active.
- Overview, SteamCMD, Logs, Backups, Settings, and Server Workspace (form, INI editor, Mods, players, and related panels) use the new renderer.
- Clusters page surfaces existing compliance for `clusterId` / `clusterDir`.
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
- Node.js 22.5+ (built-in `node:sqlite`; a recent version compatible with Electron/Vite)
- npm

## Local development

```bash
npm install
npm run dev
```

`npm install` also installs [Husky](https://typicode.github.io/husky/) git hooks (no extra setup).

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run package
```

### Git hooks

| Hook | Runs |
| --- | --- |
| **pre-commit** | `typecheck` + `lint` |
| **pre-push** | `typecheck` + `test` + `lint` |

`npm run lint` currently enforces feature-file size limits (see [docs/component-structure.md](docs/component-structure.md)); it is the placeholder for a fuller linter later.

Skip only in a real emergency: `git commit --no-verify` / `git push --no-verify`, or set `HUSKY=0`. Do **not** skip to land broken typecheck/tests — CI will still fail on PRs and `main`.

If you use **WSL** on a Windows checkout (`/mnt/f/...`), hooks auto-run npm via `cmd.exe` (Windows Node). Native WSL `npm test` fails when `node_modules` were installed for win32 (missing `@rollup/rollup-linux-*`). Prefer Node **22.5+** on Windows; WSL Node 20 is below `engines`.

GitHub Actions CI (`.github/workflows/ci.yml`) on every PR and push to `main`: **typecheck**, **lint**, **test**, and **build** on `windows-latest`. Playwright e2e / visual review stay local (see [docs/visual-testing.md](docs/visual-testing.md)).

> The product target is **Windows** (ASA binaries, SteamCMD, PowerShell/robocopy). On WSL or non-native shells, verification is often more reliable via `cmd.exe /c` when Rollup or Electron optional dependencies misbehave.
>
> Cursor Cloud / Linux agent VMs can still install, typecheck, build, and run the Electron UI for development — see [AGENTS.md](AGENTS.md) for display, `ELECTRON_RUN_AS_NODE`, and expected Linux vitest path failures.

## Project website (GitHub Pages)

Public site is Astro + Starlight in [`website/`](website/). Deploy: [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Path-filtered build CI: [`.github/workflows/website-ci.yml`](.github/workflows/website-ci.yml).

Expected URL: [https://gabomarin.github.io/yark/](https://gabomarin.github.io/yark/)

Local: `npm run website:dev` → http://localhost:4321/yark/

Screenshot gallery assets live under `website/public/screenshots/`. Refresh with `npm run build` then `npm run website:screenshots`. Full runbook: [docs/website.md](docs/website.md).

**One-time GitHub setup**

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (required once; the workflow 404s until this exists).
3. Push `website/` + the workflow to `main`, or re-run **Deploy GitHub Pages** under the Actions tab.
4. Confirm the site loads at the URL above.

If the workflow still fails on `configure-pages` with “Get Pages site failed / Not Found”, the Source is still not set to GitHub Actions. The workflow also passes `enablement: true` so it can create the Pages site when the token is allowed to do so.

Edit pages under `website/src/` (marketing) and `website/src/content/docs/` (Starlight); pushes that touch `website/**` redeploy.

## Engineering docs

- [docs/backups.md](docs/backups.md) — backup kinds, ZIP layout, IPC, schedules, player sessions, all-servers health, restore, troubleshooting
- [docs/updates-steamcmd.md](docs/updates-steamcmd.md) — SteamCMD caches, install/update/verify, safe update, availability checks
- [docs/logs.md](docs/logs.md) — operational logs, event details, clear/seed helpers
- [docs/server-lifecycle.md](docs/server-lifecycle.md) — launch args, profile→INI sync, spawn, start/stop/kill
- [docs/website.md](docs/website.md) — GitHub Pages site, screenshot gallery, deploy/capture checklist
- [AGENTS.md](AGENTS.md) — Cursor Cloud / Linux VM run notes (display, Electron, tests, e2e pitfalls)
- [docs/visual-testing.md](docs/visual-testing.md) — required Playwright review for visible UI changes (+ helper scripts)
- [docs/versioning.md](docs/versioning.md) and [CHANGELOG.md](CHANGELOG.md) — SemVer and release notes
- [docs/agent-context.md](docs/agent-context.md) and [.github/copilot-instructions.md](.github/copilot-instructions.md) — AI-assisted work rules

Project status and history live in [CHANGELOG.md](CHANGELOG.md) (and the WIP notes in this README). There is no tracked `TODO.md`.

## License

YARK server manager is licensed under the [GNU General Public License v3.0](LICENSE) (GPL-3.0-only).
