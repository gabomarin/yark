# ARK Server GBO

ARK Server GBO is a Windows desktop application for managing local dedicated ARK Survival Ascended servers.

## What it supports

- Manage multiple server profiles from a single app.
- Start, stop, restart, and force-stop server instances.
- Install and update server files with SteamCMD.
- Create backups, restore them, and review operation history.
- Inspect runtime, update, and backup logs.
- Review cluster state and RCON status from the interface.
- Manage CurseForge mod Project IDs per server (`-mods=`). The Mods tab UI is ready; metadata is currently a local mock until a CurseForge API key is available.

## Current project status

The core functionality is already working, and the frontend is being migrated to a cleaner architecture based on Electron + React + TypeScript.

The current state is:

- The shared shell and new navigation are already active.
- The Overview, SteamCMD, and Logs pages have already been migrated to the new renderer.
- Opening INI from Overview launches the new Server Workspace (3-column editor with quick server switching).
- Canonical INI defaults live in `src/shared/defaults/` (commented community templates). The ASA wiki catalog is editor metadata only and is not merged into those defaults.
- The Clusters, Backups, and Settings pages still function as visual placeholders within the new shell.
- Real integration with host-side ASA binaries and SteamCMD remains pending for E2E validation.

## Main repository structure

- src/main: Electron main process.
- src/preload: secure IPC bridge for the renderer.
- src/renderer: React/TypeScript UI.
- src/backend: domain logic, services, process management, and persistence.
- src/shared: shared contracts and types across layers.
- docs: documentation and contributor context.
- .github: instructions and profiles for agents and assistants.

## Requirements

- Windows to run the desktop app.
- Node.js 20+ (preferably a recent version compatible with Electron/Vite).
- npm.

## Local development

Install dependencies:

```bash
npm install
```

Start the app in development mode:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Verify types:

```bash
npm run typecheck
```

Build production artifacts:

```bash
npm run build
```

Package the app for Windows:

```bash
npm run package
```

> In WSL or non-native shells, the most reliable verification path is often through cmd.exe /c when Rollup or Electron optional dependencies cause issues.

## Contribution and context

Before continuing work in this repository, review:

- [TODO.md](TODO.md)
- [.github/copilot-instructions.md](.github/copilot-instructions.md)
- [docs/agent-context.md](docs/agent-context.md)
- [docs/visual-testing.md](docs/visual-testing.md) before changing visible renderer UI.

## Notes for humans and agents

- The source of truth for the current project state is [TODO.md](TODO.md).
- Keep the current architecture: Electron + React + TypeScript + local SQLite.
- Prefer small, verifiable changes focused on the root cause.
- If IPC, backend, or critical flows are touched, validate them with tests, typecheck, and build.
