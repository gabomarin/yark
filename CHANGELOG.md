# Changelog

All notable changes to **YARK server manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

How to bump versions and cut releases: see [docs/versioning.md](docs/versioning.md).

## [Unreleased]

### Added

- Opt-in **Auto-start with YARK** per server profile (default off). After leave-running reattach, eligible servers start sequentially through the normal start path; Inactive, already-running, and uncertain reattach cases are skipped with audit events. Configure on the Server tab; Settings shows a summary of opted-in profiles (#53).

## [0.5.2] - 2026-08-02

### Changed

- Reworked the repository README into a product-oriented project overview with release/CI badges, real application screenshots, operator onboarding, architecture, security boundaries, and contribution guidance.
- Refreshed the public website roadmap after 0.5.1 so shipped host-resilience work is no longer presented as future development and the published v0.6 / 1.0 direction matches the GitHub milestones.
- Corrected the Settings operator guide to describe the current mandatory Stop/Cancel confirmation when quitting with active servers.
- Expanded website and release runbooks so unsigned/signed release trust copy must stay synchronized with the artifacts actually published.

### Security

- Added SHA-256 download-verification instructions for unsigned prerelease installers and documented how this guidance must transition to Authenticode publisher/timestamp verification.
- Documented the current local credential boundary: server/admin credentials may exist in SQLite, ASA INI files, and INI backup archives and are not yet DPAPI-protected by YARK.

## [0.5.1] - 2026-08-02

### Added

- Server profiles can be enabled, disabled, and cloned. Disabled profiles stay visible on demand but cannot start, restart, or resume maintenance jobs (#129).
- Installation health classification detects missing, partial, invalid, and ready server folders on startup and on demand (#131).
- Server start probes the host TCP/UDP ports first and offers clear retry or session-port override actions when another process owns a port (#139).

### Changed

- Quitting while servers are running always asks for confirmation (Stop / Cancel). Removed the **On quit with active servers** Ask/Stop setting.
- ARK Version is displayed separately from the Steam build used for update decisions (#140).
- The supported development runtime is Node.js 22.12 or newer.

### Fixed

- Renderer document language and the operational-log export dialog now use the project's English language of record.
- CurseForge proxy batches and search pagination are bounded to prevent oversized requests from amplifying upstream API usage.

### Security

- Upgraded Electron to 43.2 and electron-builder to 26.15, removing all known npm audit findings from the desktop dependency tree.
- Enabled Electron renderer sandboxing and denied renderer-initiated navigation and window creation; validated external links continue through allowlisted IPC.

## [0.5.0] - 2026-08-01

### Added

- Windows system tray + **Close window to tray** (default on) and **Start with Windows** (default off) settings (#54).
- Sidebar shows Wildcard **Deploying** / Offline official network status (pulsing indicator + tooltip).
- **On quit with active servers** policy (Ask / Stop) with confirmation when quitting while servers run (#59). Prefer **Close window to tray** to keep servers and backups alive. Process attach/detach is for crash recovery / forced closes only (no Leave-running quit option).
- Critical-job crash recovery with durable queues and idempotent resume for install/update/verify, pre-update backup, and restore (#19).
- Original Windows application icon for the window, tray, and installer (#11).
- Public project site rebuilt with Astro + Starlight (docs, FAQ, changelog, download CTA) (#115).

### Changed

- Official version and local install probes run less often (CDN every 5 minutes; disk inspect only when official metadata changes, after SteamCMD, or on Check for updates) to avoid main-process UI freezes.

### Fixed

- Cancelling quit with **Close window to tray** off no longer leaves a dead tray-only process (window stays open until Ask/Stop resolves; tray Show recreates the window if needed).
- Quit **Stop** waits for still-starting servers, runs save + pre-stop backup with UI progress, then exits (instead of a silent process-only kill).
- Managed servers spawn detached and checkpoint process identity (OS creation time required) while active; clean stop clears the checkpoint. After an unexpected app exit or forced close, startup reattach rejects PID reuse and validates readiness via RCON (not a user-facing Leave-running quit).
- Pre-update backup recovery requires verified recovery evidence before treating a backup as complete (#127).
- Loading/busy flags in async UI paths clear on rejection so spinners and disabled actions cannot stick.

## [0.4.0] - 2026-07-30

### Added

- **Restart** is one backend operation: stop → fail-hard `pre_restart` backup (world, players, INI) → start, under a single instance lock (#13).
- Safe-update real-host validation helper (`scripts/validation/validate-safe-update.cjs`) and unit coverage for the stop → `pre_update` → SteamCMD → conditional restart/rollback path (#14).

### Changed

- UI stack upgraded to React 19.2 and Mantine 9 (#98).
- Operator-facing lock, status, update-check, backups, mods, cluster, and logs copy simplified for clearer actions (#111).

### Fixed

- Safe-update docs and `UpdateService` contract aligned with the implemented auto-stop / single `pre_update` / conditional-restart behavior (#14).

## [0.3.2] - 2026-07-29

### Added

- Runtime logs in piped mode (native console off) follow `ShooterGame/Saved/Logs` into the in-memory buffer, and the Runtime tab refreshes live while open (#67).
- Runtime **Source** select filters All / System / Server log / Process (stdout/stderr) so disk logs and GameAnalytics stderr are not forced together (#67).
- Log panels share `formatLogDateTime` (`YYYY-MM-DD HH:MM:SS`) for Events, Updates, Backups, and Runtime display (#67).
- Runtime live refresh uses `logs:runtime` (buffer only), ignores stale polls after server switches, pins `ShooterGame.log`, buffers partial lines, and treats Unreal stamps as UTC (#67).

### Changed

- Server card actions are icon-only: Play/Pause, Restart (arrows), and Update (download, `attention` token); Start remains available when an update is pending.
- Server list drops the Files column; Version uses color + weight (`ok` / `attention` / muted) to show update state.
- After a launch error, Start stays on the primary button; the red error text opens Runtime logs.
- Escape hatches stay available while starting or during SteamCMD jobs (Stop / Cancel); Update no longer claims “up to date” when the official build is unknown.
- Server list / workspace Version prefers file/exe ARK build (including `v92.28`) over a stale log `arkVersion` after SteamCMD updates.

### Fixed

- Overview Version no longer sticks on the previous ARK Version from logs after a successful update (e.g. 92.25 → 92.28).
- Closing the native console during startup no longer replaces Start with a Review error control that blocked relaunch.
- User-facing copy drops “fleet” in favor of “all servers” / “across servers” on sidebar Backups and Logs (and matching website/docs wording).
- With the native console off, Runtime no longer shows mostly YARK system lines — ASA disk logs are tailed (#67).

## [0.3.1] - 2026-07-28

### Added

- Backup history **Copy details** action (icon-only) for a plain-text diagnostic payload including status, paths, and error text (#68).
- `npm run e2e:mods` helper and `npm run website:screenshots` gallery capture script for refreshing GitHub Pages screenshots (#75).

### Changed

- Project website copy and screenshot gallery aligned with v0.3.x: Mods/Settings live, Clusters/Logs/workspace Backups shots, CurseForge Worker privacy note, and capture helpers env-configurable (#75).

### Fixed

- Scheduled world backups no longer overlap or enqueue duplicates while a prior world/scheduled backup is still running; scheduler cycles coalesce (#68).
- World snapshots skip disappearing transient Ark save artifacts (e.g. timestamped `.arkrbf` / `.tmp`) instead of failing the whole archive; missing essential world data still fails clearly (#68).

## [0.3.0] - 2026-07-28

### Added

- Dedicated **Mods** workspace tab: configure CurseForge Project IDs, enable/disable without removing, Discover search, URL/ID import, and metadata detail drawer (#16).
- Cloudflare Worker proxy (`workers/curseforge-proxy`) so the CurseForge API key stays off the Electron client; ASA-only search and lookup for the Mods tab (#16).
- Per-server `disabledMods` and `modMetadataCache` (SQLite migration v7); disabled IDs are omitted from `-mods=` on launch (#16).
- Genesis and Lost Colony added to the known ASA maps list (#66).

### Changed

- Server Workspace mounts the INI editor only on the INI Files tab (or while dirty) and trims Logs panel work when hidden, reducing renderer memory while switching tabs (#73).
- Server form Mods field notes that individual mods can be disabled from the Mods tab without removing them.

### Fixed

- CurseForge “open in browser” IPC only accepts validated ASA mod detail URLs (no arbitrary HTTPS fallback).
- New Project IDs are always Worker-verified before create/update; batch metadata hydrate keeps successful items when some IDs are skipped.

## [0.2.0] - 2026-07-27

### Added

- Functional **Settings** page for SteamCMD path, subtle shared-cache open/clear actions, and native-console-on-start preference; SteamCMD removed as a primary sidebar route (live progress stays on the floating dock; history under Logs → Updates).
- Functional **Clusters** page surfacing existing `clusterId` / `clusterDir` compliance reports and transfer guidance (live transfer validation still deferred).
- Shared renderer atoms for reuse: `AppSurfaceCard`, `ServerRuntimeStatusBadge`, `EmptyState`, `SearchField`, `SelectableListRow`, `AccentIconTile`; `ServerCard` split into local molecules + model.
- Design-system guide for Mantine surface + spacing tokens: [docs/design-system.md](docs/design-system.md).
- App spacing scale (`xxs`…`xl`) exposed as `--app-space-*` and Mantine `theme.spacing` (including `gap="xxs"`).
- Local Husky git hooks (pre-commit typecheck + lint; pre-push typecheck + test + lint) and CI build + lint gates (`npm run lint` = feature file-size policy for now).
- Agent-oriented UI composition guide: [docs/component-structure.md](docs/component-structure.md) (pragmatic Atomic Design).

### Changed

- Page panels (Clusters, Logs, Backups, Settings) and workspace side widgets share `AppSurfaceCard` + CSS surface vars instead of copy-pasted cool-panel gradients.
- Repository user-facing strings, docs, and GitHub artifacts standardized on English ([docs](docs/) / issues / PRs).

### Fixed

- SteamCMD **Copying files** phase no longer shows stale `0 / 0 MB` or leaves the UI stuck at mid-90%; sync uses an indeterminate bar after SteamCMD reaches 100%, with lighter polling during robocopy (#48).
- SteamCMD spawns with `-language english` so bootstrapper progress stays English for a single-language parser; `[ N%]` still updates percent if the OS localizes (#48).
- Incomplete multi-character path sanitization (CodeQL alert).
- Website hero copy calls builds a **public prerelease**, not private.
- Release workflow: Node 22 for tests, allow prerelease tag labels (`v0.1.0-alpha`), disable electron-builder publish (artifacts via `softprops/action-gh-release`).

## [0.1.0] - 2026-07-24

### Added

- Initial public preview of YARK server manager (Electron + React + TypeScript).
- Multi-server profiles with start / stop / restart / force-stop.
- SteamCMD install, update, and verify flows.
- Backups, operational logs, and cluster compliance checks.
- Server Workspace with INI editor and on-demand configuration assistant.
- Overview, SteamCMD, and Logs pages in the new renderer shell.
- Shared shell atmosphere (soft gradient + topography SVG) across sidebar and main content.
- Official ARK network version from Wildcard CDN for sidebar and SteamCMD chrome.
- Functional **Backups** page (list / create / restore / schedule + retention) with IPC over existing backup services.
- Per-server backup destination (default `{installDir}\\Backups`) plus open destination / open backup folder actions.
- Kind-scoped ZIP backups (`World/` / `Player profiles/` / `INI/`), disk↔SQLite reconcile, fleet health, disk alerts, and cleanup preview/run.
- Structured operational event `details` (What / Cause / Where / Try next) with clear/export support and workspace Logs deep-links (`logsFocus`).
- Engineering runbooks: [docs/backups.md](docs/backups.md), [docs/updates-steamcmd.md](docs/updates-steamcmd.md), [docs/logs.md](docs/logs.md), [docs/server-lifecycle.md](docs/server-lifecycle.md), [docs/website.md](docs/website.md).
- Project site feature screenshot gallery under `website/screenshots/` with an engineering runbook in `docs/website.md`.
- GitHub Actions Windows release workflow (tag `v*` → NSIS installer on the GitHub Release).

### Changed

- Project license set to **GPL-3.0-only** (was undeclared MIT in `package.json` only).
- Product branding renamed to **YARK server manager**.
- Mods managed from the Server tab (comma-separated CurseForge Project IDs); dedicated Mods tab deferred pending API key.
- Server start spawns `ArkAscendedServer.exe` directly (no `.cmd` / `cmd` wrapper), so lifecycle tracks the game process and spaced install paths no longer flash a visible CMD.
- Safe **Update** / **Verify** auto-stop the server when needed (stop → pre-update backup → SteamCMD → conditional restart/rollback) instead of requiring a manual stop first.

### Removed

- Tracked in-repo TODO / historical planning docs (moved to local agent context).

[Unreleased]: #unreleased
[0.5.1]: #051---2026-08-02
[0.5.0]: #050---2026-08-01
[0.4.0]: #040---2026-07-30
[0.3.2]: #032---2026-07-29
[0.3.1]: #031---2026-07-28
[0.3.0]: #030---2026-07-28
[0.2.0]: #020---2026-07-27
[0.1.0]: #010---2026-07-24
