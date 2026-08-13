# Development agent context

## Project purpose

This repository contains a desktop application for managing dedicated ARK Survival Ascended servers on Windows. The app combines an Electron main process, a secure preload layer, a React renderer, and a backend layer with process, log, backup, update, and configuration logic.

## Working rules

- Private product, design identity, and unreleased specs: prefer Notion Product Lab
  when MCP is available (hub URL only in gitignored `.cursor/project-context/README.md`).
  If Notion is unavailable, use the **full snapshots** under `.cursor/project-context/`.
  Do not link that hub from tracked files.
- Public backlog is GitHub Project #4 / Issues. Local `.cursor/project-context/TODO.md`
  is historical only.
- Keep the current architecture: Electron + React + TypeScript + local SQLite.
- Prefer small, verifiable changes.
- Avoid introducing unnecessary native dependencies when a Node/TypeScript alternative exists.
- For IPC, backend, or critical flow changes, run tests, typecheck, and build.
- After `npm install`, Husky hooks run typecheck/lint on commit and typecheck/test/lint on push; CI also runs build + `lint`.
- For visible renderer changes, follow the mandatory [visual testing protocol](visual-testing.md), including HD, Full HD, and QHD/2K review.
- When growing or splitting React UI, follow [component-structure.md](component-structure.md) (pragmatic Atomic Design for agents).
- Prefer **Mantine** components/props for renderer UI wherever they fit (Stepper,
  Modal, Tooltip, forms, layout) before custom chrome; see
  [design-system.md](design-system.md) and
  [`.cursor/rules/prefer-mantine.mdc`](../.cursor/rules/prefer-mantine.mdc).
- When cutting a release or bumping the app version, follow [versioning.md](versioning.md) and update [CHANGELOG.md](../CHANGELOG.md). `package.json` is the SemVer source of truth; the UI reads it via `@shared/app-version`. Pushing tag `vX.Y.Z` runs `.github/workflows/release.yml` (Windows NSIS → GitHub Release).
- Third-party GitHub Actions must stay SHA-pinned; see [github-actions.md](github-actions.md). `npm run lint` rejects mutable `@vN` Action tags.
- CurseForge proxy endpoint ownership (no source fallback; release bake): [curseforge-proxy.md](curseforge-proxy.md).
- On feature work, keep a **short** Unreleased changelog bullet (CI requires `CHANGELOG.md` unless `skip-changelog`); see [`.cursor/rules/changelog.mdc`](../.cursor/rules/changelog.mdc).

## Local project context (Cursor workspace, not in git)

Private planning is canonical in Notion Product Lab when reachable.
`.cursor/project-context/` keeps **full offline snapshots** plus the hub URL so
agents without Notion can still work. Do not recreate `TODO.md`, design identity,
or private specs as tracked repository files. Do not hardcode machine-absolute
paths or the Notion hub URL in tracked files.

## Key folder map

- [src/main](../src/main): main process and IPC handlers.
- [src/preload](../src/preload): exposed APIs for the renderer.
- [src/renderer](../src/renderer): React UI, layouts, features, and components.
- [src/backend](../src/backend): services, domains, process management, and persistence.
- [src/shared](../src/shared): shared types and IPC contracts. External browser opens
  (`target=_blank`, YARK update release notes) go through
  [`external-url-policy.ts`](../src/shared/external-url-policy.ts) before
  `shell.openExternal`.
- [docs](../docs): in-repo agent docs (this file, runbooks, visual testing, [website](website.md)). Private plans: Notion Product Lab; local stubs under `.cursor/project-context/`.
- [website](../website): static GitHub Pages project site + versioned feature screenshots.
- [AGENTS.md](../AGENTS.md): Cursor Cloud / Linux VM specifics (display, `ELECTRON_RUN_AS_NODE`, expected vitest path failures, e2e notes).

## Engineering runbooks

- [backups.md](backups.md) — ZIP kinds, reconcile, all-servers health/cleanup, IPC, schedules, player sessions.
- [updates-steamcmd.md](updates-steamcmd.md) — caches, safe update auto-stop/rollback, availability compare, progress push, Windows real-host validation.
- [e2e-validation.md](e2e-validation.md) — PR CI Electron E2E vs prepared-host / manual release matrix (#12).
- [critical-job-recovery.md](critical-job-recovery.md) — durable phases, replay policy, queue quarantine, and operator recovery actions.
- [profile-database.md](profile-database.md) — SQLite boot open/migrate, busy_timeout, corrupt-DB operator recovery (#218).
- [logs.md](logs.md) — event `details`, clear/export IPC, `logsFocus`, seed/visual helpers.
- [server-lifecycle.md](server-lifecycle.md) — launch args, profile→INI sync, spawn, start/stop/kill, INI sanitize / assistant; custom / Maps pack launch + Start blockers (#65 Phase 1 / #190–#195). Research archive: [spikes/65-modded-asa-maps.md](spikes/65-modded-asa-maps.md).
- [launch-options-catalog.md](launch-options-catalog.md) — verified ASA CLI catalog (#92); regenerates via `npm run catalog:launch-options`.
- [rcon.md](rcon.md) — workspace RCON console, persistent session, players, ban list.
- [settings.md](settings.md) — app-wide prefs, desktop shell, SteamCMD path, density, auto-start summary.
- [clusters.md](clusters.md) — transfer-compliance reports, cluster launch trio, Clusters page.
- [mods.md](mods.md) — workspace CurseForge inventory, enable/disable, load order, metadata proxy, `-mods=`.
- [curseforge-proxy.md](curseforge-proxy.md) — Worker abuse controls, URL ownership, secret rotation.
- [website.md](website.md) — GitHub Pages deploy, screenshot gallery capture/redaction, version pill sync.

## Current functional status

- The new renderer shell is already active.
- Overview, SteamCMD, Logs, Backups, and **Clusters** have already been migrated to the new architecture.
- Server profiles have a persisted `enabled` state separate from runtime status. Disabled profiles stay editable and visible through inactive navigation, but the shared backend start path cannot spawn them. Enable does not require install files to be ready (#132); Start / Restart / auto-start still do. Enable/disable is an explicit locked IPC operation; clones inherit the source state and use a unique install directory.
- **Remove from YARK** vs **Delete everything** (#267): `servers:delete` requires `{ deleteInstallFiles }`. Profile-only never wipes `installDir`; full wipe keeps shared-path and wipe-safety guards. Details: [server-lifecycle.md](server-lifecycle.md#remove-or-delete-a-server-267).
- **Import install** (#254 / #283): ready trees continue by default; incomplete requires `allowIncompleteInstall` (UI checkbox + backend); empty/nested stay blocked. Details: [server-lifecycle.md](server-lifecycle.md#import-existing-asa-install-254--283).
- Server Workspace keeps `Server`, **INI Files**, `Mods`, **Launch**, `Backups`,
  `Logs`, and **RCON** as its regular navigation. **Launch** edits curated
  structured ASA flags plus raw Extra arguments (command preview / conflicts);
  create/edit Server no longer hosts Mods IDs or Extra arguments. Workspace
  **Backups** is operational (create / restore / history / destination for that
  server) with kind subtabs (**World save** | **Player profiles** | **INI**).
  Sidebar **Backups** is generalized configuration across servers (schedule /
  destination / retention) with “Open in server” to jump into the workspace tab.
  **Mods** manages CurseForge Project IDs (enable/disable without dropping IDs,
  Worker-backed metadata, launch `-mods=` for enabled only) — full map:
  [mods.md](mods.md). CurseForge proxy abuse controls:
  [curseforge-proxy.md](curseforge-proxy.md) (#70). A six-step configuration
  assistant launches on demand from `Server`; it uses an isolated draft and
  writes only after explicit review. Workspace leave-guard (#292 / #299) confirms
  before sidebar / Spotlight / Back / server switch / Create / leaving Server or
  INI Files with unsaved drafts (fossil alert; Save and continue / Discard / Keep
  editing). Server tab shows Cancel when the profile is dirty.
- Settings is live in the shell (SteamCMD path, desktop shell, density, and related preferences — no light/dark theme control). Full map: [settings.md](settings.md). Clusters surfaces existing `clusterId` / `clusterDir` compliance reports (live transfer validation still deferred); see [clusters.md](clusters.md). Workspace **RCON** tab: [rcon.md](rcon.md).
- Sidebar Backups settings page and per-server workspace Backups tab are live.
- Backups are kind-scoped ZIP archives: `world` (per-map folder under `SavedArks/{MapToken}/`, including profiles/tribes in that folder), `players` (profiles from SavedArks/SaveGames), `ini` (`Game.ini` + `GameUserSettings.ini`).
  - On disk under the shared root: `World/`, `Player profiles/`, `INI/` subfolders; each snapshot is a `.zip` (legacy loose folders still restore). Listing reconciles orphan archives from disk into SQLite.
  - **World**: destination + schedule (`enabled` / `intervalMinutes`, min **5**, default **60**) + `retainCountWorld`. Schedule creates **world only**.
  - **Players**: `retainCountPlayers` (per-player pools); flat `PlayerProfiles/` archives from
    join/leave (RCON `ListPlayers` poll (~10s) + status ticks + mtime safety net); restore into
    the **current** map folder; no manual “all players” create or Players Import (#275).
  - **INI**: `retainCountIni`; manual + automatic `ini_save` after successful INI save (debounced ~2s).
  - Workspace UI: destination/schedule only on World subtab; auto-refresh (~12s) + Refresh button + `push:backups-changed` for live list updates.
- SteamCMD progress/console streaming is live via `push:steamcmd-progress` (floating dock during jobs). Path/install are on **Settings**. Richer per-file update-log streaming in Logs may still feel incomplete. Full workflows: [updates-steamcmd.md](updates-steamcmd.md).
- Safe-update real-host checklist (Windows ASA) lives in [updates-steamcmd.md](updates-steamcmd.md#real-host-validation-windows); broader lifecycle aggregation / PR E2E gates: [e2e-validation.md](e2e-validation.md) (GitHub **#12**).

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
- **Main-process I/O (#145):** do not add `execFileSync` / `spawnSync` / sync directory walks on fleet, start, stop, or SteamCMD cancel paths. Use `execFileBounded` / `fs.promises` / `killWinProcessTreeAsync`. Measurements and inventory: [server-lifecycle.md](server-lifecycle.md#main-process-io-145).
- **App refresh contract (#163):** `App.refresh` is the shared host poll. Prefer push (`onStatus`, `onBackupsChanged`, SteamCMD progress, etc.) for live runtime. Do **not** `useEffect(..., [props.servers])` (or the whole `servers` array) to reload page data — poll identity / re-render is not a membership signal. Patterns:
  - **Lookup only** (`useMemo` name maps, enabled flags): OK to depend on `props.servers`.
  - **Page data load:** mount + explicit Reload/Refresh; for membership use a stable `serverIdsKey` (see Backups), never the full profile array.
  - **Drafts:** never reset from quiet/poll refresh; dirty-preserve or load only when not dirty.
  - Overview heartbeat calls `refresh({ includeInstallation: false, includeServerList: false })` (statuses / SteamCMD / events). Profiles refresh on mutations, operator Refresh, and the slower install/CDN timer (`includeServerList` defaults true).
- The new renderer follows a feature-based pattern with a shared shell and CSS Modules.
- IPC-layer changes should keep the contracts aligned in [src/shared/ipc.ts](../src/shared/ipc.ts), [src/preload/index.ts](../src/preload/index.ts), and [src/main/ipc-handlers.ts](../src/main/ipc-handlers.ts). High-risk invoke args use Zod via `handleValidated` — inventory, validated-channel list, and verification steps: [ipc-validation.md](ipc-validation.md) (#143).
- Update availability must compare the local Steam `buildid` from `appmanifest_2430930.acf` with the public Steam build. Never compare the local runtime `ARK Version` with a version observed on an external official server; staggered deployments make those values non-equivalent.
- The informational official ARK server version comes from Wildcard's `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini`; do not replace it with a single server from a third-party listing.
- Explicit update and verify actions must always query SteamCMD. The in-session content-cache freshness window (**15 minutes**) is only valid when reusing files to **install** another server — never for update/verify. Always pass `validate` on `app_update`. Robocopy sync excludes `ShooterGame\Saved`. Details, IPC, safe-update/rollback: [updates-steamcmd.md](updates-steamcmd.md).
- **Move installation** (#56) same-volume rename (verify + rollback) or cross-volume robocopy (Saved included) with free-space progress, then commit `install_dir` and delete the previous folder. Staging leftovers are registered for startup sweep across volumes. If old-folder delete fails, the prior path is recorded in main; cleanup IPC may only wipe that recorded path (#215). Profile `update` must not change `installDir`. IPC: `servers:move-install`, `servers:move-install-cancel`, `servers:move-install-cleanup`, `push:move-install-progress`. E2E: `npm run e2e:move-install`.
- Progression and breeding in the beginner assistant use semantic discrete presets, with their exact multipliers visible. `Current` restores only that group's original values. The change counter must remain actionable and expose the derived before/after summary from any step.
- `bUseSingleplayerSettings` is a high-impact explicit choice: profiles preserve it, known effective rates are shown, and the UI warns about additional XP/engram and tamed-creature stat effects. Difficulty is treated as one user concept backed by `DifficultyOffset` and `OverrideOfficialDifficulty`; preserve both raw values until the user explicitly chooses a level.
- If a visible UX change is introduced, also review the documented state in `.cursor/project-context/TODO.md`.
