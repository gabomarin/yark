# Development agent context

## Project purpose

This repository contains a desktop application for managing dedicated ARK Survival Ascended servers on Windows. The app combines an Electron main process, a secure preload layer, a React renderer, and a backend layer with process, log, backup, update, and configuration logic.

## Working rules

- Review [TODO.md](../TODO.md) before starting or continuing work.
- Keep the current architecture: Electron + React + TypeScript + local SQLite.
- Prefer small, verifiable changes.
- Avoid introducing unnecessary native dependencies when a Node/TypeScript alternative exists.
- For IPC, backend, or critical flow changes, run tests, typecheck, and build.

## Key folder map

- [src/main](../src/main): main process and IPC handlers.
- [src/preload](../src/preload): exposed APIs for the renderer.
- [src/renderer](../src/renderer): React UI, layouts, features, and components.
- [src/backend](../src/backend): services, domains, process management, and persistence.
- [src/shared](../src/shared): shared types and IPC contracts.
- [docs](../docs): additional documentation and design notes.

## Current functional status

- The new renderer shell is already active.
- Overview, SteamCMD, and Logs have already been migrated to the new architecture.
- Clusters, Backups, and Settings remain placeholders within the new shell.
- Live log streaming during active SteamCMD operations is still pending.
- Real E2E validation against host-side binaries and SteamCMD is still not covered.

## Recommended verification

Before closing significant changes:

```bash
npm test
npm run typecheck
npm run build
```

If the environment has issues with Electron or Rollup, the more reliable path is:

```bash
cmd.exe /c npm run typecheck
cmd.exe /c npm run build
```

## Implementation notes

- The new renderer follows a feature-based pattern with a shared shell and CSS Modules.
- IPC-layer changes should keep the contracts aligned in [src/shared/ipc.ts](../src/shared/ipc.ts), [src/preload/index.ts](../src/preload/index.ts), and [src/main/ipc-handlers.ts](../src/main/ipc-handlers.ts).
- If a visible UX change is introduced, also review the documented state in [TODO.md](../TODO.md).
