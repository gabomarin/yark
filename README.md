# YARK server manager

**Work in progress.** YARK server manager is a Windows desktop application for managing local dedicated ARK: Survival Ascended servers. Features will be added, changed, or refined as development continues — treat the current build as an evolving preview, not a finished product.

## What it supports today

- Manage multiple server profiles from a single app.
- Start, stop, restart, and force-stop server instances.
- Install and update server files with SteamCMD.
- Create backups, restore them, and review operation history.
- Inspect runtime, update, and backup logs.
- Review cluster state and RCON status from the interface.
- Manage CurseForge mod Project IDs per server (`-mods=`) from the Server form. A dedicated Mods tab is deferred until a CurseForge API key is available.

## Current status

Core flows already work (profiles, process control, SteamCMD install/update, backups, logs, INI editing). The UI is being migrated to a cleaner Electron + React + TypeScript shell:

- Shared shell and navigation are active.
- Overview, SteamCMD, Logs, and Server Workspace (INI editor) use the new renderer.
- Clusters, Backups, and Settings pages are still placeholders inside the new shell.
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

## Agent / assistant context

For AI-assisted work in this repo, see:

- [docs/agent-context.md](docs/agent-context.md)
- [.github/copilot-instructions.md](.github/copilot-instructions.md)
- [docs/visual-testing.md](docs/visual-testing.md) before changing visible renderer UI
- [docs/versioning.md](docs/versioning.md) and [CHANGELOG.md](CHANGELOG.md) when cutting a release

Local backlog / historical plans (not published in git) live under `.cursor/project-context/`.
