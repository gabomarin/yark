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
- [docs](../docs): in-repo agent docs (this file, runbooks, visual testing, [website](website.md)). Backlog/plans live under `.cursor/project-context/`.
- [website](../website): static GitHub Pages project site + versioned feature screenshots.
- [AGENTS.md](../AGENTS.md): Cursor Cloud / Linux VM run notes.

## Engineering runbooks

- [backups.md](backups.md) — ZIP kinds, reconcile, fleet health/cleanup, IPC, schedules, player sessions.
- [updates-steamcmd.md](updates-steamcmd.md) — caches, safe update auto-stop/rollback, availability compare, progress push.
- [logs.md](logs.md) — event `details`, clear/export IPC, `logsFocus`, seed/visual helpers.
- [server-lifecycle.md](server-lifecycle.md) — launch args, profile→INI sync, spawn, start/stop/kill, INI sanitize / assistant.
- [website.md](website.md) — GitHub Pages deploy, screenshot gallery capture/redaction, version pill sync.

## Current functional status

- The new renderer shell is already active.
- Overview, SteamCMD, Logs, and Backups have already been migrated to the new architecture.
- Server Workspace keeps `Server`, `INI Files`, `Backups`, and **Logs** as its regular navigation. Workspace **Backups** is operational (create / restore / history / destination for that server) with kind subtabs (**World save** | **Player profiles** | **INI**). Sidebar **Backups** is fleet health plus schedule / destination / retention / disk alerts / cleanup, with “Open in server” to jump into the workspace tab. Mods are edited on the Server tab (comma-separated CurseForge Project IDs) until a CurseForge API key enables a dedicated Mods UI. A six-step configuration assistant launches on demand from `Server`; it uses an isolated draft and writes only after explicit review.
- Clusters and Settings remain placeholders within the new shell.
- The public project site (`website/`) includes a screenshot gallery; refresh shots and keep site copy aligned when featured UI changes — see [website.md](website.md).
- Backups are kind-scoped ZIP archives (`world` / `players` / `ini`) with separate triggers for schedule, player sessions, INI-on-save, and pre-update. Disk reconcile recovers interrupted `running` rows, imports orphan ZIPs/legacy folders (minting a new id on manifest collisions), and drops missing completed paths. Fleet **stale** age warnings require an active process; **never backed up** still warns while schedule is on even if stopped. Full workflows: [backups.md](backups.md).
- Safe **Update** / **Verify** may run while the server is active: the manager stops before pre-update backup (update) and SteamCMD, then restarts if it was running (rollback on failure). Live SteamCMD console/progress uses `push:steamcmd-progress`. Details: [updates-steamcmd.md](updates-steamcmd.md).
- Operational events can carry structured `details` (What / Cause / Where / Try next). Fleet Logs deep-links into workspace Logs via `logsFocus`. Clear APIs exist per section. See [logs.md](logs.md).
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

- Launch args, profile→INI sync, Windows spawn flags, start/stop/kill/restart, readiness, port rules, INI sanitize, and the on-demand configuration assistant: [server-lifecycle.md](server-lifecycle.md). Do not add a permanent Guided Configuration tab; keep the six-step assistant on-demand from `Server`.
- The new renderer follows a feature-based pattern with a shared shell and CSS Modules.
- IPC-layer changes should keep the contracts aligned in [src/shared/ipc.ts](../src/shared/ipc.ts), [src/preload/index.ts](../src/preload/index.ts), and [src/main/ipc-handlers.ts](../src/main/ipc-handlers.ts).
- Update availability must compare the local Steam `buildid` from `appmanifest_2430930.acf` with the public Steam build. Never compare the local runtime `ARK Version` with a version observed on an external official server; staggered deployments make those values non-equivalent. SteamCMD caches / safe update: [updates-steamcmd.md](updates-steamcmd.md).
- The informational official ARK server version comes from Wildcard's `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini`; do not replace it with a single server from a third-party listing.
- Progression and breeding in the beginner assistant use semantic discrete presets, with their exact multipliers visible. `Current` restores only that group's original values. The change counter must remain actionable and expose the derived before/after summary from any step.
- `bUseSingleplayerSettings` is a high-impact explicit choice: profiles preserve it, known effective rates are shown, and the UI warns about additional XP/engram and tamed-creature stat effects. Difficulty is treated as one user concept backed by `DifficultyOffset` and `OverrideOfficialDifficulty`; preserve both raw values until the user explicitly chooses a level.
- If a visible UX change is introduced, also review the documented state in `.cursor/project-context/TODO.md`.
