# Development agent context

## Project purpose

This repository contains a desktop application for managing dedicated ARK Survival Ascended servers on Windows. The app combines an Electron main process, a secure preload layer, a React renderer, and a backend layer with process, log, backup, update, and configuration logic.

## Working rules

- Review `.cursor/project-context/TODO.md` before starting or continuing work (local Cursor workspace context; gitignored; not part of the public repo).
- Keep the current architecture: Electron + React + TypeScript + local SQLite.
- Prefer small, verifiable changes.
- Avoid introducing unnecessary native dependencies when a Node/TypeScript alternative exists.
- For IPC, backend, or critical flow changes, run tests, typecheck, and build.
- For visible renderer changes, follow the mandatory [visual testing protocol](visual-testing.md), including HD, Full HD, and QHD/2K review.
- When cutting a release or bumping the app version, follow [versioning.md](versioning.md) and update [CHANGELOG.md](../CHANGELOG.md). `package.json` is the SemVer source of truth; the UI reads it via `@shared/app-version`.

## Local project context (Cursor workspace, not in git)

Until a project-management tool is adopted, planning / status / historical design notes live here:

- `.cursor/project-context/TODO.md` — backlog / status
- `.cursor/project-context/docs/` — design notes and historical plans/specs

Do not recreate `TODO.md` or tech-debt plans as tracked repository files. Do not hardcode machine-absolute paths to this context.

## Key folder map

- [src/main](../src/main): main process and IPC handlers.
- [src/preload](../src/preload): exposed APIs for the renderer.
- [src/renderer](../src/renderer): React UI, layouts, features, and components.
- [src/backend](../src/backend): services, domains, process management, and persistence.
- [src/shared](../src/shared): shared types and IPC contracts.
- [docs](../docs): in-repo agent docs (this file, visual testing). Backlog/plans live under `.cursor/project-context/`.

## Current functional status

- The new renderer shell is already active.
- Overview, SteamCMD, and Logs have already been migrated to the new architecture.
- Server Workspace keeps `Server`, `INI Files`, and `Backups` as its regular navigation. Workspace **Backups** is operational (create / restore / history / destination for that server) with kind subtabs (**World save** | **Player profiles** | **INI**). Sidebar **Backups** is generalized configuration across servers (schedule / destination / retention) with “Open in server” to jump into the workspace tab. Mods are edited on the Server tab (comma-separated CurseForge Project IDs) until a CurseForge API key enables a dedicated Mods UI. A five-step configuration assistant launches on demand from `Server`; it uses an isolated draft and writes only after explicit review.
- Clusters and Settings remain placeholders within the new shell.
- Sidebar Backups settings page and per-server workspace Backups tab are live.
- Backups are kind-scoped: `world` (full SavedArks including `.arkprofile*`), `players` (profiles from SavedArks/SaveGames), `ini` (`Game.ini` + `GameUserSettings.ini`).
  - **World**: destination + schedule (`enabled` / `intervalMinutes`, min **5**, default **60**) + `retainCountWorld`. Schedule creates **world only**. World is a full SavedArks folder snapshot (profiles included).
  - **Players**: `retainCountPlayers` (per-player pools for join/leave archives); RCON `ListPlayers` poll (~10s) while `running`, plus immediate ticks on process status changes; connect/disconnect archives per player; disconnect waits briefly for ASA to flush the `.arkprofile*`; leaving `running` flushes remaining online players as disconnects; SavedArks profile mtime scan backs up new/changed profiles when the player is not online (covers short sessions RCON missed). Manual “Backup all players” still snapshots every profile.
  - **INI**: `retainCountIni`; manual create; automatic `ini_save` backup after each successful INI save (debounced ~2s) via the `ini:save` IPC path (editor + wizard). Not on the world schedule.
  - Shared `backupDir` root for all kinds. UI: destination/schedule card only on the World subtab; Players/INI tabs keep a compact retain control near the history list.
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

- Dedicated server launch args are built only by `buildLaunchArgs` / `formatLaunchCommandLine` in `src/backend/domains/instances/launch-args.ts` (logical shape `"Map"?SessionName="..."` with separate quotes — never `"Map?SessionName=..."`), dash `-port`, default `-ServerPlatform=ALL`, no `?listen`, no RCON/passwords/`-QueryPort` on CLI). Profile RCON/passwords/query port are synced into `GameUserSettings.ini` via `syncProfileSettingsToIni` before start. On Windows, ProcessManager spawns `ArkAscendedServer.exe` **directly** with those logical args and `windowsVerbatimArguments: false` / `shell: false` (Node quotes spaced exe paths and escapes embedded quotes so argv keeps `"Map"?SessionName="..."`). Do not use a `.cmd` / `cmd /c` / `start` wrapper — that flashes a visible CMD and makes lifecycle track `cmd.exe` instead of the game. Avoid `windowsVerbatimArguments: true` when the exe path has spaces (Node leaves the path unquoted and argv breaks). Native console mode uses the same direct spawn with `windowsHide: false`; piped mode uses `windowsHide: true` plus stdout/stderr pipes. UI/runtime logs use the logical quoted shape via `formatLaunchCommandLine`.
- The new renderer follows a feature-based pattern with a shared shell and CSS Modules.
- IPC-layer changes should keep the contracts aligned in [src/shared/ipc.ts](../src/shared/ipc.ts), [src/preload/index.ts](../src/preload/index.ts), and [src/main/ipc-handlers.ts](../src/main/ipc-handlers.ts).
- Update availability must compare the local Steam `buildid` from `appmanifest_2430930.acf` with the public Steam build. Never compare the local runtime `ARK Version` with a version observed on an external official server; staggered deployments make those values non-equivalent.
- The informational official ARK server version comes from Wildcard's `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini`; do not replace it with a single server from a third-party listing.
- Explicit update and verify actions must always query SteamCMD. The in-session content-cache freshness window is only valid when reusing files to install another server.
- The INI files under `src/shared/defaults` are the canonical source for creating and resetting configuration. ASA may regenerate client-only sections such as `ShooterGameUserSettings` in the runtime `GameUserSettings.ini`; treat them as generated noise, sanitize them on read and save, and never surface them as pending user changes.
- Do not add a permanent `Guided Configuration` tab. The beginner experience is an on-demand assistant launched from `Server`; experienced administrators retain the explicit `INI Files` visual/raw workflow.
- The configuration assistant must initialize from current INI values, preserve unknown settings, remain read-only until `Apply changes`, and refuse to open while the manual INI editor has pending changes. Before applying, read the latest INI payload again and overlay only the curated fields so external changes are not overwritten.
- Progression and breeding in the beginner assistant use semantic discrete presets, with their exact multipliers visible. `Current` restores only that group's original values. The change counter must remain actionable and expose the derived before/after summary from any step.
- `bUseSingleplayerSettings` is a high-impact explicit choice: profiles preserve it, known effective rates are shown, and the UI warns about additional XP/engram and tamed-creature stat effects. Difficulty is treated as one user concept backed by `DifficultyOffset` and `OverrideOfficialDifficulty`; preserve both raw values until the user explicitly chooses a level.
- If a visible UX change is introduced, also review the documented state in `.cursor/project-context/TODO.md`.
