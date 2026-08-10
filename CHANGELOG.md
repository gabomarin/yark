# Changelog

All notable changes to **YARK server manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

How to bump versions and cut releases: see [docs/versioning.md](docs/versioning.md).

## [Unreleased]

### Changed

- Launch and Mods profile saves use narrow `updateServerPatch` IPC with server-side merge and per-server write serialization so concurrent panel edits no longer last-write-wins (#209).
- Overview server cards skip re-render on unrelated status polls via a memoized card and a stable fleet action bag; focused cards open the row menu with Shift+F10 (#209).

### Fixed

- Workspace tab crashes show a recoverable panel error instead of blanking the whole app shell (#209).

### Security

- GitHub Actions are pinned to immutable commit SHAs (Node 24 runtimes), with Dependabot updates and a lint gate against mutable Action tags (#148).
- Every renderer→main IPC invoke validates arguments with Zod before domain code runs (#143).
- CurseForge proxy adds route-class IP rate limits, POST body/time bounds, GET response caching, privacy-safe request logs, and an abuse/secret-rotation runbook (#70).
- Move-install cleanup may only delete the prior install path recorded by main for that server after a successful move (#215).

## [0.8.1] - 2026-08-09

### Added

- Quiet **YARK updates** check (and Settings **Check now**) show an operator toast when a new desktop build is available or ready to install; click opens Settings → YARK updates.

### Fixed

- Public docs body links under GitHub Pages now keep the `/yark` base (e.g. Settings → Logs & diagnostics no longer jumps to `/docs/logs/`).

## [0.8.0] - 2026-08-09

### Added

- Shared **YarkDataTable** (`mantine-datatable`) powers backup history and the Mods load-order table (density, empty/loading, dual view-sort vs drag reorder); adopt/keep decisions for other lists are in `docs/datatable.md` (#94).
- Right-click **context menus** on server cards, backup history rows, and mods table rows reuse the same Mantine **Menu** chrome as kebabs (#105).
- Main window opens **maximized** by default and remembers the last size, position, and maximized state across launches.
- App **Sidebar** uses a Docker-style **half-circle edge toggle** (`50vh`; curve faces sidenav when expanded, content when rail) for Full ↔ icon-rail; preferred mode is remembered (#107).
- Wide server workspace list uses a **header Full / icon-rail** chevron (280↔72, no free-drag), **status dots**, and **cluster grouping** (icon-rail uses Mantine **Divider**s between clusters); preferred rail mode is remembered (#107).
- Custom / map-mod servers show the CurseForge mod **logo** as map art on cards, the workspace header, and the server switcher list when linked (#193). Official maps use bundled art in those surfaces too.
- Enabling a CurseForge **Maps** mod shows a toast and lists it under Server Information → Map (**Map mods** group); choosing it sets the launch token and linked `mapModId` (#192).
- CurseForge proxy returns truncated plain-text **description** for **Maps**-category mods on get/batch so map-token heuristics can read `Map Name:` (#195).
- Launch tab yellow alert and Start block when a custom map’s linked map mod is missing, disabled, or unset (#194).
- Profiles can store an optional **map mod Project ID** (`mapModId`) for custom ASA maps; clones keep it and official maps clear it (#190).
- Spike research for **modded ASA maps** beyond `KNOWN_MAPS` (launch contract, Mods→map token heuristics, custom map fallback) documented under `docs/spikes/` (#65).
- Server Information Map control supports **Custom…** free-text ASA launch tokens (e.g. `Svartalfheim_WP`) for modded maps (#65, #191).
- Versioned **ASA launch-options catalog** (wiki ASA Check/Missing + YARK-owned classification) with a browse modal (#92).
- Server workspace **Launch** tab: curated structured ASA flags, raw Extra arguments, command preview, and caution alerts for sticky risky options (#93).
- Backup fleet alerts can be **Dismiss**ed; they stay hidden until the condition changes (e.g. a new failed backup).
- Global **Quick jump** (Ctrl+K) via Mantine Spotlight for page jumps, opening a server by name, and a small **Recent** list (#104).

### Changed

- Overview **Check Servers Health** shows progress on the button itself and a completion toast (attention count or all-clear); SteamCMD install/update/verify, `runAction` failures, and Backups page save/cleanup results use toasts instead of the top/page error banners; the redundant **Your servers** heading is removed; **Recent activity** stays side-by-side on wide layouts only (narrower Servers shows **View logs** instead); secondary pages snap closer to shared spacing/selection tokens (#96).
- Sidebar footer copy reads **ARK official version**, with that block and the YARK version label centered.
- Backups fleet health strip uses shared **AppMetricCard** tiles (with disk **RingProgress** and a stronger selected filter state) instead of a local StatCard (#103).
- Log event lists use Mantine **Accordion** expand/collapse; Overview recent activity uses **Timeline** (#102).
- SteamCMD and Logs consoles share a **ScrollArea** monospace surface with stick-to-bottom while streaming (#101).
- Operator docs and website cover CurseForge **Maps** / custom map launch (Mods → Map select → Start checks) from the #65 spike outcomes (#192, #194, #195).
- Newly added Mods start **disabled**; enable them explicitly before they appear in `-mods=` / Map mods.
- Sidebar route items use Mantine **NavLink** (active state + icons) while keeping YARK brand chrome (#106).
- Launch-options catalog copy is cleaned from wiki noise into **summary + details**, with a pasteable **example** per entry (#92).
- Extra arguments and the Mods ID field moved off create/edit Server onto the **Mods** / **Launch** workspace tabs (#93).
- Launch tab dependent flags chain in order (dynamic config URL; game → tribe → RCON logs); `-passivemods=` lives under World & gameplay (#93).
- Sidebar rail edge toggle uses a larger hit target (≥24×24) for pointer/touch accessibility (#209).
- E2E helpers leave the server workspace via the sidebar **Servers** nav (the removed header Back control no longer breaks suite/mods/copy/clusters scripts).
- Website screenshot capture always uses an isolated temp profile and seeded demo fleet (never the operator’s real userData).
- Mods enable Switch ignores Mantine track-label hit interception so toggles respond reliably to pointer clicks.

### Fixed

- Fleet `refresh` ignores stale overlapping IPC snapshots so a slower poll cannot regress server list/status (#209).
- Launch tab draft no longer resets mid-edit when a save bumps `updatedAt`; Launch/Mods persists read the latest profile/mod id refs and skip local apply after a mid-flight server switch (#209).
- `target=_blank` opens only allowlisted http(s) hosts (wiki / CurseForge / GitHub) via `shell.openExternal`; empty/leading-dot hosts cannot match the CurseForge suffix rule (#209).
- CurseForge proxy refuses upstream redirects away from HTTPS `api.curseforge.com` (#209).
- Quick jump (Ctrl+K) no longer rebuilds its action tree on every App poll when servers/recent are unchanged (#209).
- Logs/Backups loading spinners clear only for the latest in-flight load; Mods Discover search always clears its busy state (#209).
- Fleet poll runs only on the **Servers** list (not inside workspace / other routes); backup history quiet refresh stays scoped to the Backups panel while it is open (#94).
- Heartbeat `setState` reuses unchanged status / SteamCMD / events / install snapshots so a quiet poll does not re-render the whole app tree (#94).
- Quiet **player-list** pushes (~10s ListPlayers poll) and unchanged SteamCMD progress no longer re-render workspace chrome (Mods tooltips/toolbar) (#94).
- SteamCMD quiet reconcile ignores `checkedAt` clock stamps so Overview heartbeats do not thrash status identity (#94).
- Mods context-menu Remove uses the same confirm dialog as the trash button; drag handle uses a correct DnD `innerRef`; reorder busy disables row toggles (#94).
- Mods Metadata column shows category and downloads only (Updated stays in its own column) (#94).
- Mods row actions are three icon-only buttons (details, CurseForge, add/remove); the URL column and kebab are removed (#94).
- Fleet poll no longer replaces unchanged server profile object identities, so Mods/Backups mid-edit actions and open context menus are not cancelled every few seconds (#94).
- Failed backup fleet alerts use a single **Logs** action that opens Logs → Backups and highlights the failed archive (removed redundant Open).

### Removed

- Redundant **Back to servers** control from the workspace header (sidebar navigation still confirms before discarding unsaved INI changes).

## [0.7.0] - 2026-08-07

### Added

- **Create server** can pick **None** or an existing fleet cluster (fills ID +
  shared directory), shows live **port conflicts** vs the fleet, and links to
  **Create a cluster first…** when none exist; first-run onboarding no longer
  repeats cluster/ports (#178).
- **Copy configuration** between server profiles: one-shot selective copy of INI settings, mods, launch args, backup policy, and opt-in passwords to one or more stopped targets (from Overview or workspace Quick actions), with Merge/Replace preview, fingerprint checks, and a recoverable pre-copy snapshot — never copies identity, ports, cluster, or saves (#95).
- Cluster INI templates support per-member **Promote**, **Restore** (with backup), and opt-in **Seed** when adding servers; ports/passwords/session stay profile-owned (#89).
- **Create cluster** from the Clusters workspace: assign a unique Cluster ID and shared directory to one or more stopped servers (#42).
- **Add / remove servers** on an existing cluster from the Clusters detail panel (stopped servers only; shared transfer files are never deleted) (#41).
- Optional **cluster INI templates** (Game.ini / GameUserSettings.ini) editable from Clusters detail with the same visual INI table patterns as the server editor; per-server identity/ports and ASE-legacy ActiveMods keys are stripped — ASA mods stay on the Mods panel (#88).

### Changed

- Cluster template **Promote / Restore / Seed** can target Game.ini and/or GameUserSettings.ini (default both); unselected files stay unchanged (#181).
- **Enable server** no longer requires installation files to be ready; Start / Restart / auto-start still do (#132).
- Clusters compact density: summary badges use `sm`, detail actions inherit the theme button size, and the ambiguous “Transfer-ready config” header badge is removed (list Ready/Warnings/Errors + card rail remain).
- Server and cluster INI editors share a **GameUserSettings / Game.ini** segmented file switch; category group headers use a stronger accent rail (#88).
- INI file and Visual/Text switches share one aligned nav row and the same selected accent as category headers (#88).
- INI settings tables keep a **720px minimum width** with horizontal scroll so description and restore stay separated on narrow windows (#88).
- Cluster INI template modal keeps a pinned footer and a full-height Text editor (#88).
- Server INI editor metadata is built from `defaults/*.ini` only (`ini-setting-meta`); the wiki scrape and catalog merge scripts are removed.
- Clusters compliance no longer warns when multiple servers share the same map (common for multi-instance fleets).
- Clusters refreshes compliance automatically when the view opens; the Recheck button was removed.
- Public site docs cover **Copy configuration** and workspace **RCON**, and Getting started / Profiles / Clusters match create-server join-cluster and membership flows.

### Fixed

- Server and cluster **INI editors** ignore stale async loads when switching server/cluster mid-fetch, and the workspace dirty flag updates from edit events (not a sync effect) so leave-guards stay accurate.
- Cluster and **Copy configuration** wizards remount when opened so form state resets cleanly without flash-of-stale UI.
- **Copy configuration** keeps every checked category when several are toggled in quick succession (no longer drops earlier INI picks) (#95).
- **Copy configuration** no longer loses GameUserSettings rates when mods/launch args are copied in the same run (INI is written before profile→INI sync) (#95).
- **Copy configuration** full-file Replace no longer copies blocked ASE keys such as ActiveMods; backup schedule copy keeps the target backup folder; select-all only picks stopped targets (#95).
- **YARK updates** no longer fail with a 404 when downloading a new release: installers now publish under a space-free filename (`YARK-server-manager-Setup-<version>.exe`) that matches the updater metadata and the website download button (#165).

## [0.6.0] - 2026-08-05

### Added

- In-app **YARK updates** (Settings + accented sidebar version): quiet check after launch, download and restart-to-install from GitHub Releases, safe busy-state blocking, and an assisted Windows installer for choosing the destination and shortcuts (#165).
- **Log retention** for YARK-owned events and SteamCMD update logs (safe defaults, Settings controls, automatic cleanup, and manual preview) without deleting ASA runtime logs (#84).
- **Portable backup export/import** copies a completed archive to a chosen path or catalogs a validated YARK ZIP into a server’s backup history without restoring; managed and export filenames end with a compact local date (`YYYYMMDD-HHmmss`), and each history row can delete that archive (#15).
- Engineering runbooks for **Settings**, workspace **RCON** console, and **Clusters** transfer compliance (`docs/settings.md`, `docs/rcon.md`, `docs/clusters.md`).
- **Move installation** moves same-drive folders in place (or copies across drives with live progress), verifies, commits the profile path, then removes the previous folder. Install path is read-only in normal server editing (#56).
- Opt-in **Auto-start with YARK** per server profile (default off). After leave-running reattach, eligible servers start sequentially through the normal start path; Inactive, already-running, and uncertain reattach cases are skipped with audit events. Configure on the Server tab; Settings shows a summary of opted-in profiles (#53).
- **Map artwork** thumbs for known ASA maps on the server list and workspace header (#158).

### Fixed

- Sidebar **Backups** suppresses “schedule on, no world backup yet” fleet alerts (and At risk) while the server is stopped; unknown + tooltip cover that idle state instead.
- Sidebar **Backups** no longer resets unsaved schedule/policy edits when App polls `listServers` (~5s) (#15).
- Backup **create/restore** (and schedule edits) require installation health Ready; empty installs can still list, export, import, and delete archives (#15).
- Backup **export** no longer fails with `EPERM` when saving to a Windows drive root (e.g. `H:\archive.zip`), and the suggested filename keeps a real `.zip` extension instead of turning it into `-zip.zip` (#15).
- **Move installation** recovers orphaned cross-drive staging folders on startup, surfaces cancel failures in the dialog, estimates copy progress from free disk space, clears leftover cleanup state when leaving the old folder, and shows distinct Move-button guidance for an active move vs a files job (#56).

### Changed

- Sidebar **Backups** health badges (Protected / At risk / Critical / Unknown) show plain-language tooltips.
- Sidebar **Backups** fleet alerts use a compact scrollable Alerts panel (readable wrapped messages; page banners no longer crush under fill-viewport layout) instead of stacked full-width banners.
- Filesystem paths use shared read-only chips with Browse/Clear (`ReadonlyPath` / `PathField`) across Settings, servers, clusters, and backups (#52).
- Pull requests must change the `## [Unreleased]` section of `CHANGELOG.md` (or use the `skip-changelog` label); agents follow `.cursor/rules/changelog.mdc`.

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
[0.6.0]: #060---2026-08-05
[0.5.2]: #052---2026-08-02
[0.5.1]: #051---2026-08-02
[0.5.0]: #050---2026-08-01
[0.4.0]: #040---2026-07-30
[0.3.2]: #032---2026-07-29
[0.3.1]: #031---2026-07-28
[0.3.0]: #030---2026-07-28
[0.2.0]: #020---2026-07-27
[0.1.0]: #010---2026-07-24
