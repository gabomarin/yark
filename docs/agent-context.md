# Development agent context

## Project purpose

This repository contains a desktop application for managing dedicated ARK Survival Ascended servers on Windows. The app combines an Electron main process, a secure preload layer, a React renderer, and a backend layer with process, log, backup, update, and configuration logic.

## Working rules

- Review `.cursor/project-context/TODO.md` before starting or continuing work (local Cursor workspace context; gitignored; not part of the public repo).
- Keep the current architecture: Electron + React + TypeScript + local SQLite.
- Prefer small, verifiable changes.
- Avoid introducing unnecessary native dependencies when a Node/TypeScript alternative exists.
- For IPC, backend, or critical flow changes, run tests, typecheck, and build.
- After `npm install`, Husky hooks run typecheck/lint on commit and typecheck/test/lint on push; CI also runs build + `lint`.
- For visible renderer changes, follow the mandatory [visual testing protocol](visual-testing.md), including HD, Full HD, and QHD/2K review.
- When growing or splitting React UI, follow [component-structure.md](component-structure.md) (pragmatic Atomic Design for agents).
- When cutting a release or bumping the app version, follow [versioning.md](versioning.md) and update [CHANGELOG.md](../CHANGELOG.md). `package.json` is the SemVer source of truth; the UI reads it via `@shared/app-version`. Pushing tag `vX.Y.Z` runs `.github/workflows/release.yml` (Windows NSIS → GitHub Release).

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
- [docs](../docs): in-repo agent docs (this file, runbooks, visual testing, [website](website.md)). Backlog/plans live under `.cursor/project-context/`.
- [website](../website): static GitHub Pages project site + versioned feature screenshots.
- [AGENTS.md](../AGENTS.md): Cursor Cloud / Linux VM specifics (display, `ELECTRON_RUN_AS_NODE`, expected vitest path failures, e2e notes).

## Engineering runbooks

- [backups.md](backups.md) — ZIP kinds, reconcile, all-servers health/cleanup, IPC, schedules, player sessions.
- [updates-steamcmd.md](updates-steamcmd.md) — caches, safe update auto-stop/rollback, availability compare, progress push, Windows real-host validation.
- [critical-job-recovery.md](critical-job-recovery.md) — durable phases, replay policy, queue quarantine, and operator recovery actions.
- [logs.md](logs.md) — event `details`, clear/export IPC, `logsFocus`, seed/visual helpers.
- [server-lifecycle.md](server-lifecycle.md) — launch args, profile→INI sync, spawn, start/stop/kill, INI sanitize / assistant.
- [website.md](website.md) — GitHub Pages deploy, screenshot gallery capture/redaction, version pill sync.

## Current functional status

- The new renderer shell is already active.
- Overview, SteamCMD, Logs, Backups, and **Clusters** have already been migrated to the new architecture.
- Server Workspace keeps `Server`, `INI Files`, `Mods`, `Backups`, and **Logs** as its regular navigation. Workspace **Backups** is operational (create / restore / history / destination for that server) with kind subtabs (**World save** | **Player profiles** | **INI**). Sidebar **Backups** is generalized configuration across servers (schedule / destination / retention) with “Open in server” to jump into the workspace tab. **Mods** manages CurseForge Project IDs (enable/disable without dropping IDs, Worker-backed metadata, launch `-mods=` for enabled only). A six-step configuration assistant launches on demand from `Server`; it uses an isolated draft and writes only after explicit review.
- Server profiles can be marked **inactive** without deletion. Inactive
  profiles are hidden from the default Overview fleet until expanded, cannot
  spawn ASA or use restart/RCON, but remain fully available for offline
  configuration, logs, backups, health inspection, cloning, and SteamCMD
  maintenance.
- Settings is live in the shell (SteamCMD path, theme, and related preferences). Clusters surfaces existing `clusterId` / `clusterDir` compliance reports (live transfer validation still deferred).
- Sidebar Backups settings page and per-server workspace Backups tab are live.
- Backups are kind-scoped ZIP archives: `world` (full SavedArks including `.arkprofile*`), `players` (profiles from SavedArks/SaveGames), `ini` (`Game.ini` + `GameUserSettings.ini`).
  - On disk under the shared root: `World/`, `Player profiles/`, `INI/` subfolders; each snapshot is a `.zip` (legacy loose folders still restore). Listing reconciles orphan archives from disk into SQLite.
  - **World**: destination + schedule (`enabled` / `intervalMinutes`, min **5**, default **60**) + `retainCountWorld`. Schedule creates **world only**.
  - **Players**: `retainCountPlayers` (per-player pools); RCON `ListPlayers` poll (~10s) + status ticks + mtime safety net; connect/disconnect archives.
  - **INI**: `retainCountIni`; manual + automatic `ini_save` after successful INI save (debounced ~2s).
  - Workspace UI: destination/schedule only on World subtab; auto-refresh (~12s) + Refresh button + `push:backups-changed` for live list updates.
- SteamCMD progress/console streaming is live via `push:steamcmd-progress` (floating dock during jobs). Path/install are on **Settings**. Richer per-file update-log streaming in Logs may still feel incomplete. Full workflows: [updates-steamcmd.md](updates-steamcmd.md).
- Safe-update real-host checklist (Windows ASA) lives in [updates-steamcmd.md](updates-steamcmd.md#real-host-validation-windows); broader lifecycle aggregation is GitHub **#12**.

## Recommended verification

Before closing significant changes:

```bash
npm test
npm run typecheck
npm run build
```

Visible renderer changes also require a Playwright review of the real Electron
build at `1280×720`, `1920×1080`, and `2560×1440`. Environment requirements,
launch instructions, helper scripts, evidence, and review criteria are documented in
[docs/visual-testing.md](visual-testing.md).

**Platform notes**

- Product target is Windows. On WSL, if Electron/Rollup optional deps misbehave:

```bash
cmd.exe /c npm run typecheck
cmd.exe /c npm run build
```

- On Cursor Cloud / Linux agents: follow [AGENTS.md](../AGENTS.md). Expect ~8 vitest failures that assert Windows path semantics (not a regression). Unset `ELECTRON_RUN_AS_NODE` and use the GUI display for `npm run dev` / `npm start` / e2e. There is no ESLint config; `npm run typecheck` is the static-analysis gate.

## Implementation notes

- Launch args, profile→INI sync, Windows spawn flags, start/stop/kill/restart, readiness, port rules, INI sanitize, and the on-demand configuration assistant: [server-lifecycle.md](server-lifecycle.md). Do not add a permanent Guided Configuration tab; keep the six-step assistant on-demand from `Server`.
- The new renderer follows a feature-based pattern with a shared shell and CSS Modules.
- IPC-layer changes should keep the contracts aligned in [src/shared/ipc.ts](../src/shared/ipc.ts), [src/preload/index.ts](../src/preload/index.ts), and [src/main/ipc-handlers.ts](../src/main/ipc-handlers.ts).
- Update availability must compare the local Steam `buildid` from `appmanifest_2430930.acf` with the public Steam build. Never compare the local runtime `ARK Version` with a version observed on an external official server; staggered deployments make those values non-equivalent.
- The informational official ARK server version comes from Wildcard's `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini`; do not replace it with a single server from a third-party listing.
- Explicit update and verify actions must always query SteamCMD. The in-session content-cache freshness window (**15 minutes**) is only valid when reusing files to **install** another server — never for update/verify. Always pass `validate` on `app_update`. Robocopy sync excludes `ShooterGame\Saved`. Details, IPC, safe-update/rollback: [updates-steamcmd.md](updates-steamcmd.md).
- Progression and breeding in the beginner assistant use semantic discrete presets, with their exact multipliers visible. `Current` restores only that group's original values. The change counter must remain actionable and expose the derived before/after summary from any step.
- `bUseSingleplayerSettings` is a high-impact explicit choice: profiles preserve it, known effective rates are shown, and the UI warns about additional XP/engram and tamed-creature stat effects. Difficulty is treated as one user concept backed by `DifficultyOffset` and `OverrideOfficialDifficulty`; preserve both raw values until the user explicitly chooses a level.
- If a visible UX change is introduced, also review the documented state in `.cursor/project-context/TODO.md`.
