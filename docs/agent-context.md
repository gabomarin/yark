# Development agent context

## Project purpose

This repository contains a desktop application for managing dedicated ARK Survival Ascended servers on Windows. The app combines an Electron main process, a secure preload layer, a React renderer, and a backend layer with process, log, backup, update, and configuration logic.

## Working rules

- Review [TODO.md](../TODO.md) before starting or continuing work.
- Keep the current architecture: Electron + React + TypeScript + local SQLite.
- Prefer small, verifiable changes.
- Avoid introducing unnecessary native dependencies when a Node/TypeScript alternative exists.
- For IPC, backend, or critical flow changes, run tests, typecheck, and build.
- For visible renderer changes, follow the mandatory [visual testing protocol](visual-testing.md), including HD, Full HD, and QHD/2K review.

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
- Server Workspace separates `Configuración guiada` from the familiar `Archivos INI` visual/raw experience. Both views share one payload, dirty state, and save flow; the last configuration experience is remembered locally.
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

Visible renderer changes also require a Playwright review of the real Electron
build at `1280×720`, `1920×1080`, and `2560×1440`. Environment requirements,
launch instructions, evidence, and review criteria are documented in
[docs/visual-testing.md](visual-testing.md).

If the environment has issues with Electron or Rollup, the more reliable path is:

```bash
cmd.exe /c npm run typecheck
cmd.exe /c npm run build
```

## Implementation notes

- The new renderer follows a feature-based pattern with a shared shell and CSS Modules.
- IPC-layer changes should keep the contracts aligned in [src/shared/ipc.ts](../src/shared/ipc.ts), [src/preload/index.ts](../src/preload/index.ts), and [src/main/ipc-handlers.ts](../src/main/ipc-handlers.ts).
- Update availability must compare the local Steam `buildid` from `appmanifest_2430930.acf` with the public Steam build. Never compare the local runtime `ARK Version` with a version observed on an external official server; staggered deployments make those values non-equivalent.
- The informational official ARK server version comes from Wildcard's `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini`; do not replace it with a single server from a third-party listing.
- Explicit update and verify actions must always query SteamCMD. The in-session content-cache freshness window is only valid when reusing files to install another server.
- The INI files under `src/shared/defaults` are the canonical source for creating and resetting configuration. ASA may regenerate client-only sections such as `ShooterGameUserSettings` in the runtime `GameUserSettings.ini`; treat them as generated noise, sanitize them on read and save, and never surface them as pending user changes.
- Do not collapse guided configuration and file-oriented configuration into one ambiguous mode. New users enter `Configuración guiada`; experienced administrators retain the explicit `Archivos INI` visual/raw workflow.
- If a visible UX change is introduced, also review the documented state in [TODO.md](../TODO.md).
