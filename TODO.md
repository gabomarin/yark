# TODO

Project status for continuing work without losing context.

## Status criteria
- `[x]` Done
- `[-]` Partial / in progress
- `[ ]` Pending

## MVP and primary requirements

### Base platform
- [x] Windows desktop application with Electron + React + TypeScript.
- [x] Local persistence with SQLite (`node:sqlite`).
- [x] Architecture separated into main / preload / renderer / backend.
- [x] Initial project documentation and human/agent context (README + docs/agent-context.md).
- [-] Initial unit, integration, and E2E test baseline.

### Multi-server
- [-] Create, edit, clone, and delete multiple server profiles.
- [x] On create, the chosen folder is the base and the server installs under `base\<name>` (e.g. `C:\ark_servers` + `my_server` → `C:\ark_servers\my_server`); the UI shows the final path.
- [x] Port validation and conflict checks across instances.
- [x] Per-server status display in the UI.
- [x] Install status display (installed / not installed) and detected version per server.
- [ ] E2E UI for creating, cloning, and deleting servers.

### Lifecycle / server operations
- [x] Start server.
- [x] Stop server with a prior save attempt via RCON.
- [x] Force-stop the server.
- [-] Safe restart with prior backup.
- [x] Automated real-boot test of `ProcessManager` through `running` state.
- [x] `starting` state until real readiness (RCON ListPlayers / log signals); on failure or timeout → `error` (does not stay falsely `running`).
- [x] Deleting a server removes the profile and the `installDir` folder from disk (with path guards and shared-installDir guards).
- [ ] Full E2E test against a real ASA binary on the host.

### Cluster / transfers
- [x] `clusterId` and `clusterDir` configuration per server.
- [x] Cluster consistency validation across maps.
- [x] Visual cluster compliance check in the UI.
- [ ] Validated flow with real servers sharing a cluster and real transfers.

### INI configuration
- [x] ASA settings catalog (descriptions/defaults from the user’s commented INIs + wiki.gg) integrated in shared; defaults/known keys derived from the catalog.
- [x] Advanced editor for `GameUserSettings.ini` and `Game.ini`.
- [x] Common configuration templates / presets.
- [x] Validation and diff before saving INI changes.
- [x] Canonical defaults in `src/shared/defaults/GameUserSettings.ini` and `Game.ini` (source of truth with comments); the ASA catalog only adds missing keys.
- [-] Server workspace in the new frontend (side list to switch servers, Configuration with Setting/Value/Description table, presets, raw Advanced, basic mods, and actions panel). Still needs final visual polish, editable Startup Parameters, and the Files/Backups/Logs/Players/Console tabs from the mockup.

### Backups and restore
- [x] Manual backup.
- [x] Scheduled backups.
- [x] Pre-restart backups.
- [-] Pre-update backups.
- [x] Pre-restore safety backups.
- [x] Retention policies by count and days.
- [x] Restore from backup.
- [ ] Restore history in the DB.
- [ ] Manual selection of a specific backup from a fuller UI.
- [ ] Backup export / import or guided external restore.

### Mods
- [x] Basic mods field by IDs in load order.
- [x] Friendly Mods UI (list, detail, add by ID, reorder) with local mock metadata.
- [ ] Replace mock with the official CurseForge API when `CURSEFORGE_API_KEY` exists (Overwolf).
- [ ] Mod compatibility validation across cluster nodes.
- [ ] Automatic mod install / update.

### Administrative tasks / RCON
- [x] Custom RCON client.
- [x] Quick commands (`SaveWorld`, `ListPlayers`, `Broadcast`).
- [x] Field for a custom RCON command.
- [ ] Visible RCON response history in the UI.

### Safe updates
- [-] Safe per-server update with prior backup.
- [-] Stop → update → start → health check → rollback on failure.
- [-] Update event logging.
- [-] On-disk update log.
- [-] Configurable `steamcmd.exe` path.
- [-] Assisted SteamCMD installer.
- [-] Bootstrap of base server files via SteamCMD.
- [x] Reusable SteamCMD cache across servers: `cwd` in SteamCMD home (depotcache), `force_install_dir` before login, shared `asa_content_cache` install + local sync (robocopy) preserving `ShooterGame\Saved`.
- [-] Persistent critical job queue for updates and bootstrap (persistent queue with retries for install-files/update and backup/restore; full UI visibility still missing).

### Observability and logs
- [x] Recent events persisted and visible in the UI.
- [x] Runtime status per server.
- [x] Visible install/update progress: floating panel with live console, progress bar on ServerCard, push IPC + 1s poll while an operation is active.
- [-] Process / update / backup log view from the UI (event filters, search, internal scroll, copy and export ready; Phase 2 redesign applied: top tabs Events/Runtime/Update Logs/Backups, “Update History” panel with detail and “Open in external viewer” via `shell.openPath`; already migrated to the new frontend as `LogsPage` on Mantine + CSS Modules for persisted history. Final visual polish of the updates tab still pending).
- [ ] Advanced log rotation.
- [ ] Guided diagnostics for real boot failures.

### Automation / robustness / idempotency
- [x] In-memory lock per instance to avoid conflicting operations.
- [-] In-memory backup scheduler.
- [-] Partial idempotency in critical jobs (plus persistent queue and retries for critical SteamCMD jobs).
- [ ] Persistence of queue / locks / jobs for recovery after app restart.
- [ ] Controlled retries for remote or system operations.
- [ ] Dedicated IPC endpoint to “restart server” (today the ServerCard Restart button does sequential `stop` + `start` from the renderer, without atomicity or intermediate-failure handling at the backend).

### Operational UX
- [x] Native folder picker for server and cluster paths.
- [x] Button to open the server folder in Explorer.
- [x] Overview option to open a native Windows CMD when starting a server (persistent UI toggle).
- [x] Contextual buttons to install files and run server update.
- [x] Global button to install SteamCMD (default local path).
- [x] Native file picker for `steamcmd.exe`.
- [-] SteamCMD panel in the UI (status + recent console output + active per-server process cancellation + configurable manual path; operational hierarchy, full-height console, and compact technical context completed. Only more advanced per-server actions remain pending if a real need justifies them).
- [-] Visual improvements for managing backups, restores, and logs (base UI redesign applied, section navigation in logs, internal scroll in panels, better width use and iconography; final polish and guided diagnostics remain).
- [-] Sidebar-style navigation redesign (Phase 1 complete: shell with persistent sidebar + Overview merged with Servers, Clusters, Backups, SteamCMD, Logs, Settings pages; iconography and responsive collapse of sidebar to icons-only below 900px). “Fidelity correction” phase complete: iconography migrated to real `@phosphor-icons/react` library (replaces hand-drawn SVGs, same `IconName` API), ServerCard redesigned with thumbnail placeholder, 2-row meta-grid (Players/Map/Cluster, Mods/Version/Status) and icon-only action row (Start, Stop, Restart, Open folder, kebab menu with Edit/INI/Logs/Install-Update/Clone/Force stop/Delete), SteamCMD stats card removed from Overview and replaced by Backups (placeholder) and Updates (real, comparing `officialVersion` vs detected local version), “Official Version” relocated to the Sidebar. Phase 2 (Logs redesign) complete in its static part: top tabs Events/Runtime/Update Logs/Backups, Update History with detail and log viewer, “Open in external viewer” button (IPC `logs:open-update-file` via `shell.openPath`); persisted history already migrated to the new frontend as `LogsPage`. UI rewrite v2: new shell active; `Overview`, `SteamCMD`, and `Logs` migrated; `Clusters`, `Backups`, and `Settings` remain placeholders. **Server Workspace (server editor) Phase 1**: from Overview → INI opens a 3-column layout (server list for quick switching / Configuration INI+mods / status+quick actions panel), reusing existing INI IPC. Immediate next: polish workspace, editable Startup Parameters, remaining mockup tabs, Logs streaming, then the Backups page.
- [ ] Guided assistants for bootstrap, update, and restore.

## Product and UX roadmap

This section tracks commercial polish of the renderer separately from the
functional backlog. Improvements should reuse existing architecture and
components whenever reasonable. Before significant layout changes, a proposal
is presented for approval.

### Iteration 1 — Cleanup and coherence

Goal: remove signals of incomplete or generic product without redesigning the
main screens.

- [x] Unify the renderer’s visible language and remove unnecessary Spanish/English mixes.
- [x] Remove empty or “coming soon” metrics from Overview.
- [x] Hide tabs, routes, and actions that do not yet offer a functional experience.
- [x] Remove temporary workspace notes while they lack persistence.
- [x] Move “Show server console on start” out of the Overview header.
- [x] Correct mod references from Workshop to CurseForge for ASA.
- [x] Use appropriate Mantine controls in the form (`Select`, `NumberInput`, `PasswordInput`) where they improve clarity and validation.
- [x] Consolidate colors, radii, shadows, surfaces, and states in the shared theme via semantic variables consumed by renderer styles.
- [x] Define a single feedback pattern for notifications, contextual alerts, and errors.
- [x] Review text smaller than 12 px and fix anything that harms readability.

Current feedback pattern:

- Notification: brief confirmation or result that does not block the flow.
- Contextual alert: error or warning belonging to a screen, form, or editor.
- Shell alert: failure of a global operational action; not duplicated as a notification.
- Modal: destructive confirmation, loss of changes, or a risky decision.
- Progress dock: long SteamCMD operations and their cancellation.

Exit criteria:

- [x] No simulated content, dead controls, or obvious language inconsistencies in active flows.
- [x] Overview, server creation, and workspace pass a clarity, hierarchy, actions, consistency, and accessibility review via Playwright and Chrome DevTools.

First-pass validation (2026-07-24):

- [x] Renderer tests: 11/11.
- [x] Typecheck.
- [x] Build.
- [-] Full suite: 116/117 in joint runs; the real-process test fails when cleaning a temporary folder locked by Windows (`EBUSY`) and passes when run in isolation.
- [x] Visual review of the real Electron build at 1440x900 and 1100x720: no console errors or horizontal overflow.
- [x] Real font verified via Chrome DevTools (`Segoe UI`); effective fallback to `Trebuchet MS` removed.
- [x] Save action visible from the first viewport in server create and edit.
- [x] Shared vertical scroll across all workspace tabs; INI editors keep internal scroll for long lists.
- [x] INI file access simplified as a contextual action next to the title, with the path available via tooltip.
- [x] Workspace tabs fitted to available height: INI tables grow with the window and Server shares the same surface and scroll pattern.
- [x] Full visual protocol at `1280×720`, `1920×1080`, and `2560×1440`: create and workspace without global overflow or console errors; internal scrolls working.
- [x] Non-blocking findings moved to Iteration 2: Overview wastes space on wide screens and still keeps generic dashboard patterns.

### Iteration 2 — Operational Overview and visual identity

Goal: make the main screen prioritize servers and issues that need attention,
with an identity suited to an ARK world operations center without becoming a
gamer interface.

- [x] Present and approve an incremental layout proposal before implementing it.
- [x] Replace the metrics dashboard with a compact, actionable operational summary (block 2.1: metrics removed, contextual search, and limited useful width).
- [x] Simplify `ServerCard` and show only real, priority information (block 2.2: horizontal operational row, scannable metadata, and secondary menu).
- [x] Define a single contextual primary action per server state (`Install`, `Start`, `Update`, `Manage`, `Review error`, or `Cancel`).
- [-] Move RCON off the card into the workspace or future console (removed from Overview; quick actions in workspace, custom command pending advanced console).
- [x] Improve empty, loading, error, install, and update states (loading skeletons, first server, and search-with-no-results complete the Overview states).
- [x] Compact Recent activity to five operational events, remove RCON noise from the summary, and keep a direct link to Logs.
- [x] Reduce gradients, shadows, and nested cards (flat surfaces, depth via contrast, shadows reserved for floating elements).
- [-] Introduce a distinct visual direction: first Paleo-Tech pass applied and documented in `docs/design-direction.md`; still needs gradual extension to secondary screens.
- [-] Design an application brand that does not depend on the old ARK Survival Evolved logo (initial biotech symbol in the sidebar; final distribution icon pending).
- [x] Validate the layout in wide and compact desktop windows.

Exit criteria:

- [x] In under five seconds it is clear how many servers exist, which are active, and which need attention (summary + amber badge + spine/primary action per row).
- [x] The screen feels specific to administering ARK worlds and not like a generic dashboard (Paleo-Tech on Overview/SteamCMD/Logs; no decorative metrics).
- [x] Frequent actions require fewer decisions without hiding advanced capabilities (one contextual primary; secondaries in kebab; “New server” as the header CTA).

Block 2.3 validation (2026-07-24):

- [x] Typecheck and build.
- [x] Focused Overview, Recent activity, and ServerCard tests: 8/8.
- [x] Real build reviewed with Playwright at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] Search-with-no-results state and navigation to Logs verified.
- [x] No horizontal overflow, console errors, or renderer exceptions.
- [x] Recent activity limited to five relevant events and without RCON commands.

Block 2.4 validation — Paleo-Tech identity (2026-07-24):

- [x] Typecheck and build.
- [x] Joint AppShell, Overview, Recent activity, ServerCard, and workspace tests: 11/11.
- [x] Overview and workspace reviewed with Playwright at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No horizontal overflow, CSP errors, console errors, or renderer exceptions.
- [x] Decorative gradients removed from the active renderer and topographic pattern packaged as a local asset.

Block 2.5 validation — custom Radix palette (2026-07-24):

- [x] Full blue, neutral gray, and alpha scales integrated as renderer tokens, with Display P3/OKLCH variants.
- [x] Semantic tokens and Mantine internal variables aligned to the same color source.
- [x] Focus, hover, and selection states migrated from inherited colors to Radix alpha levels.
- [x] Typecheck, build, and focused AppShell, Overview, Recent activity, ServerCard, and workspace tests: 11/11.
- [x] Overview, workspace, Logs, and SteamCMD reviewed with Playwright at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No horizontal overflow, console errors, or renderer exceptions across the twelve screenshots.

Block 2.6 validation — Obsidian Atmosphere (2026-07-24):

- [x] Sidebar and canvas unified via a night-blue–obsidian transition.
- [x] Gradients limited to atmosphere, active navigation, and operational rows; actions and work surfaces keep clarity.
- [x] Semantic panel and border tokens cooled without changing the original Radix scales.
- [x] Typecheck, build, and focused AppShell, Overview, ServerCard, and workspace tests: 9/9.
- [x] Overview and workspace reviewed with Playwright at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No horizontal overflow, console errors, or renderer exceptions.

Post–block 2.6 UX/UI audit (2026-07-24):

- [x] Rebalance the surface scale: elevated control/panel border from roughly `1.51:1` to `3.10:1`; focus/control reaches `6.85:1`.
- [x] Reduce temperature mixing in workspace and editors via semantic chrome, panel, control, hover, and border levels.
- [x] Give the INI editor more useful width at `1280×720`: responsive compact mode with full-width editor and secondary panels on demand.
- [x] Simplify INI editor category filters: single selector with counts and options available per file.
- [x] Logs uses viewport height, internal scroll, and a compact master-detail hierarchy that prioritizes the console over metadata and decorative surfaces.
- [x] Differentiate hierarchy in SteamCMD: operational status, technical context, and console have weights and heights matching their importance.
- [x] Review Overview empty space at `2560×1440` without turning it back into a metrics dashboard.

Block 2.7 validation — Tek microtexture (2026-07-24):

- [x] Custom continuous SVG with fragmented geometry, connections, nodes, and strata; no external dependencies or assets.
- [x] Texture packaged as a local asset under `2 KB`, without `currentColor`, absolute paths, or `background-attachment: fixed`.
- [x] Macro topographic curves kept as an independent layer.
- [x] Repetition presented at `720×720` and attenuated with a vertical mask to protect content areas.
- [x] Typecheck, build, and focused AppShell, Overview, and workspace tests: 5/5.
- [x] Overview, workspace, and Logs reviewed with Playwright at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No visible seams, horizontal overflow, console errors, or renderer exceptions.

Block 2.8 validation — server selection (2026-07-24):

- [x] Intense blue fill replaced by a dark surface with minimal blue tint.
- [x] Selection communicated via side indicator, soft border, and icon emphasis.
- [x] Build and focused workspace test: 1/1.
- [x] Workspace reviewed with Playwright at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No horizontal overflow, console errors, or renderer exceptions.

Block 2.9 validation — server containers (2026-07-24):

- [x] Gray surface replaced by a semantic night-blue–obsidian mix.
- [x] New tokens `--app-color-panel-cool` and `--app-color-panel-cool-emphasis` available for operational containers.
- [x] List skeletons and empty states aligned to the same visual temperature.
- [x] Typecheck, build, and focused Overview and ServerCard tests: 6/6.
- [x] Overview reviewed with Playwright at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No horizontal overflow, console errors, or renderer exceptions.

Block 2.10 validation — surface hierarchy (2026-07-24):

- [x] Semantic scale applied to workspace, server form, INI editors, server panel, and side actions.
- [x] Mantine controls aligned globally with coherent surface, border, hover, disabled, and focus.
- [x] Active tabs, table headers, and separators moved off local grays/rgba.
- [x] Primary text softened without losing readability; secondary text keeps enough hierarchy.
- [x] Typecheck, build, and focused AppShell, Overview, ServerCard, and workspace tests: 9/9.
- [x] Server, Game.ini, GameUserSettings.ini, Overview, Logs, and SteamCMD reviewed with Playwright at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No horizontal overflow, console errors, or renderer exceptions across the eighteen screenshots.
- [x] Logs and SteamCMD show no regressions; their internal hierarchy remains explicit later-block work.

Block 2.11 validation — adaptive workspace (2026-07-24):

- [x] Below `1600 px`, the server list and status/actions panel no longer permanently compete with the editor.
- [x] Server selector and secondary actions reused in left and right drawers; start, restart, and stop stay visible in the header.
- [x] Switching servers from the drawer closes the layer and keeps protection against unsaved INI changes.
- [x] Editor reaches `1032 px` useful width at `1280×720`; from `1600 px` it returns to the three-column layout with a measured minimum of `832 px`.
- [x] Typecheck, build, and focused AppShell, Overview, ServerCard, and workspace tests: 10/10.
- [x] Playwright/Electron reviewed at `1280×720`, `1598×900`, `1600×900`, `1920×1080`, and `2560×1440`.
- [x] Server, Game.ini, GameUserSettings.ini, Mods, and Advanced walked; drawers and real wheel scroll verified.
- [x] No global horizontal or vertical overflow, console errors, or renderer exceptions.

Block 2.12 validation — INI category filters (2026-07-24):

- [x] Fifteen category buttons replaced by a single searchable selector next to settings search.
- [x] The selector shows only categories present in the active file and includes each category’s setting count.
- [x] A category is kept when switching files if still available; otherwise it automatically returns to “All settings”.
- [x] At `1280×720`, two chip rows were removed and the table starts about `80 px` earlier.
- [x] Selector, menu, category selection, and wheel scroll verified with real data.
- [x] Typecheck, build, and focused workspace and category taxonomy tests: 6/6.
- [x] Game.ini and GameUserSettings.ini reviewed with Playwright/Electron at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No global overflow, console errors, or renderer exceptions.

Block 2.13 validation — Logs operational height (2026-07-24):

- [x] `PageScaffold` extended with optional `fillViewport` mode, without changing other pages’ behavior.
- [x] Header and tabs stay visible; Events, Runtime, Updates, and Backups occupy only the remaining height.
- [x] Events, backups, update history, and console content have independent scroll regions.
- [x] At `1280×720`, the page went from about `4321 px` tall to exactly `720 px`; Events keeps `4092 px` of content inside a `470 px` region.
- [x] Updates keeps list and detail side by side; metadata and the external action stay visible while the console scrolls.
- [x] Empty states for Events, Runtime, and Backups centered and explanatory to avoid empty cards without intent.
- [x] Typecheck, build, and focused Logs tests: 2/2.
- [x] All four tabs reviewed with Playwright/Electron at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] Wheel scroll verified; no global overflow, console errors, or renderer exceptions.

Block 2.14 validation — Updates density and hierarchy (2026-07-24):

- [x] Four metadata cards replaced by a compact `58 px` strip with date, duration, and size.
- [x] Redundant server removed from the detail; it remains visible in the global selector.
- [x] “Open in external viewer” integrated into the detail header without occupying its own row.
- [x] History identifies the real file and keeps the date as secondary context.
- [x] Intense blue selection replaced by a dark surface, soft border, and side indicator consistent with the workspace.
- [x] Master-detail headers reduced to `18 px`, UUID to `14 px`, and metadata to `11–12 px` so chrome does not compete with the console.
- [x] At `1280×720`, the update console grew from about `213 px` to `400 px`; it reaches `760 px` on Full HD and `1120 px` on 2K.
- [x] Typecheck, build, and focused Logs tests: 2/2.
- [x] Events, Runtime, Updates, and Backups reviewed with Playwright/Electron at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No global overflow, clipping of priority metadata, console errors, or renderer exceptions.

Block 2.17 validation — Iteration 2 closing design review (2026-07-24):

- [x] Operational “N need attention” badge (not installed / update / error) next to the server summary.
- [x] Header “Check for updates” changed to `subtle` so it does not compete with “New server”.
- [x] “Files” meta in warn tone when install is missing or an update is available.
- [x] Visual protocol: `npm run build` + `node scripts/visual-iter2-review.cjs` at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] Screens: Overview, SteamCMD, Logs (Events/Updates), Workspace (Server / INI Files / Mods).
- [x] QHD evidence: summary `2 servers · none active`, badge `2 need attention`, primaries `Update`/`Install`, no overflow or console errors.
- [x] Focused Overview + ServerCard tests: 9/9; typecheck and build OK.
- [x] Explicitly deferred: final distribution icon; Paleo-Tech on Clusters/Backups/Settings placeholders; advanced RCON in console.

Block 2.16 validation — Overview on QHD/2K (2026-07-24):

- [x] Narrow `1680 px` cap removed; useful content grows to `2200–2400 px`.
- [x] From `1600 px`, servers and recent activity move to a parallel layout with a sticky panel (no decorative metrics).
- [x] Documented in `docs/design-direction.md` under “Overview on wide screens”.
- [x] Typecheck and focused Overview / ServerCard tests.
- [x] Visual protocol (`docs/visual-testing.md`) with `npm run build` + `node scripts/visual-overview.cjs`.
- [x] Resolutions: `1280×720` (stacked), `1600×900` (parallel), `1920×1080` (parallel), `2560×1440` (parallel; overview ≈ `2312 px`, servers ≈ `1796 px`, activity `400 px`).
- [x] No horizontal overflow, console errors, or `pageerror` across the four screenshots.
- [x] Primary CTA “New server” visible; activity does not compete with the list at 720p (stays below).
- [x] Reusable script: `scripts/visual-overview.cjs` (screenshots in `%TEMP%\ark-gbo-visual-overview`).

Block 2.15 validation — operational SteamCMD and blue-obsidian surfaces (2026-07-24):

- [x] Generic metrics and independent technical cards replaced by operational status, context strip, and primary console.
- [x] Not configured, available, and in-progress states automatically define title, explanation, badge, indicator, and relevant action.
- [x] Active progress integrates percentage, bytes processed, queue, and cancel without competing with the console.
- [x] Path, official version, depotcache, and ASA content grouped in a compact strip with truncation and full value available via native tooltip.
- [x] `SteamCmdPage` uses full viewport height; console went from a fixed `360 px` max to `351 px` at 720p, `711 px` on Full HD, and `1071 px` on 2K.
- [x] Floating progress dock hides automatically when SteamCMD is already the active view.
- [x] SteamCMD and Logs adopt the same blue-gray family as Servers at lower intensity to keep hierarchy.
- [x] Typecheck, build, and focused SteamCMD and Logs tests: 4/4.
- [x] SteamCMD and Updates reviewed with Playwright/Electron at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] No global overflow, console errors, or renderer exceptions.

Operational fix — ASA update false positive (2026-07-24):

- [x] Update availability no longer compares local-log `ARK Version` with the version observed on an external official server.
- [x] Status is determined only by comparing the local `buildid` from `appmanifest_2430930.acf` with the public Steam build.
- [x] If either comparable build is missing, the UI shows “Unverified” instead of claiming “Up to date” or “Update available”.
- [x] An explicit update or verify action always queries SteamCMD; fresh cache is only reused when installing files on other servers.
- [x] Sidebar clarifies that the official ARK version is informational and SteamCMD determines updates.
- [x] Real case validated with local `92.21`, previously observed third-party value `92.23`, and matching Steam build `24346423`: Files shows “Up to date” and the action is “Start”.
- [x] App relaunched twice via Playwright/Electron; state stayed consistent after restart and there were no renderer errors.
- [x] Regression tests for matching builds, outdated builds, incomparable sources, and explicit cache; typecheck and build OK.
- [-] Full suite: 130/131 in joint runs due to the known `EBUSY` when cleaning a temporary Windows folder; the real-process test passes in isolation 1/1.

Official ARK version source fix (2026-07-24):

- [x] Removed dependency on the fixed Arkpocalypse server from ArkStatus.
- [x] Informational version obtained from `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini`, published by the official ARK/Wildcard CDN.
- [x] Parser tolerates states such as `Online` or `Deploying` and extracts only the `(vX.Y)` value.
- [x] If the official status has no version, the UI shows “Not detected”; it does not substitute a incompatible Steam build.
- [x] Real source verified with response `Online (v92.21)`.
- [x] Sidebar validated at `1280×720`, `1920×1080`, and `2560×1440`, plus two consecutive Electron launches: `92.21` consistent and no renderer errors.
- [x] Focused tests: 28/28; typecheck and build OK.

INI fix — client settings regenerated by ASA (2026-07-24):

- [x] Confirmed that canonical defaults in `src/shared/defaults` contain no client keys.
- [x] Identified that the ASA dedicated server regenerates the `ShooterGameUserSettings` section in the runtime file.
- [x] Backend read filters client sections and keys before exposing configuration.
- [x] Editor uses the filtered content as baseline and no longer shows pending changes or asks to save to clear generated noise.
- [x] Read remains non-destructive; the on-disk file only changes during a real save action.
- [x] Focused tests 19/19, typecheck and build OK.
- [x] Real editor validated at `1280×720`, `1920×1080`, and `2560×1440`: no warning, client keys, false pending state, global overflow, or renderer errors; internal scroll working.

### Iteration 3 — Smart Configuration

Goal: make visual configuration the primary experience and relegate INI files to
Advanced Mode.

- [x] Information architecture approved and documented in `docs/smart-configuration-architecture.md`.
- [-] Organize the most-used settings by user goals; first curated selection of 16 concepts completed, further expansion pending validation.
- [x] Integrate Smart Configuration as an on-demand assistant without removing the recognizable `Game.ini` and `GameUserSettings.ini` experience.
- [-] Add readable names and outcome-oriented descriptions for curated settings; full catalog pending.
- [-] Enrich controls by type and range; profiles, semantic presets, switches, and numeric inputs already cover the initial assistant.
- [x] Show recommended profiles and consequences without applying changes on selection.
- [x] Add a readable change summary before saving.
- [x] Allow viewing previous/new values from the change counter at any step.
- [x] Keep pending-change state visible and whether a server restart is required.
- [x] Keep the current visual editor and raw editing of both files inside an explicit `INI Files` view.
- [ ] Gradually split `ConfigurationEditor` by responsibility without rewriting its functional logic.
- [ ] Prepare mods management for CurseForge, dependencies, conflicts, load order, and updates.

Proposed blocks:

- [x] 3.1 Group the existing visual/raw experience under `INI Files`.
- [x] 3.2 Create a five-step on-demand assistant for existing servers.
- [x] 3.3 Expand and validate the curated frequent-settings selection.
- [x] 3.4 Optionally reuse the assistant after creating a server.

Block 3.2 validation — on-demand assistant:

- [x] Removed the provisional tab that only merged both INI files.
- [x] Launcher integrated in `Server`; habitual navigation reduced to Server, INI Files, and Mods.
- [x] Five initial steps: profile, pace, breeding, comfort, and review (expanded in 3.3).
- [x] Pace and breeding use coordinated semantic presets; show their exact multipliers and allow returning to current values.
- [x] Single-player mode is presented as a high-impact setting, never changes implicitly with a profile, and shows known effective rates.
- [x] Difficulty is presented as one concept; max level, `DifficultyOffset`, and `OverrideOfficialDifficulty` are coordinated only after an explicit choice.
- [x] `Very fast` clearly differentiates pace with XP `5×`, gathering `5×`, and taming `10×`.
- [x] Opening, walking, and canceling work on a draft and do not write to disk.
- [x] Only curated concepts are modified; unknown content and section casing are preserved.
- [x] Before applying, disk is re-read and the draft is overlaid on the latest version to preserve external changes.
- [x] Assistant is blocked if the manual editor has pending changes.
- [x] Final apply uses Zod, backend preview, and explicit save; manual editor reloads afterward.
- [x] Focused tests 26/26, typecheck and build OK.
- [-] Full suite 147/148 due to the known `EBUSY` when cleaning a temporary Windows folder; the real-process test passes in isolation 1/1.
- [x] Launcher, start, and review walked with Playwright/Electron at `1280×720`, `1920×1080`, and `2560×1440`.
- [x] Internal scroll working at 720p, footer/progress accessible, no global overflow, console errors, or exceptions.

Block 3.3 validation — curated expansion:

- [x] New concepts: MaxPlayers, density, harvest node health, day/night cycle, food/water drain, structure resistance.
- [x] `World` step with semantic presets (Base / Friendly / Balanced / Demanding); experience profiles declare them.
- [x] Model tests cover INI write and world presets.

Block 3.4 validation — post-creation onboarding:

- [x] After create (not clone), workspace opens with an optional checklist.
- [x] Checklist: experience, cluster, ports, and install files; `Later` does not block.
- [x] `Configure with assistant` reuses `ConfigurationWizard`.
- [x] Port conflicts via shared `findPortConflicts`; cluster compliance via `checkCluster`.
- [x] Preset, difficulty, single-player mode, and interactive summary adjustments: focused tests 16/16, typecheck and build OK.
- [x] Pace, breeding, and changes modal reviewed in Electron at `1280×720`, `1920×1080`, and `2560×1440`; no overflow or renderer errors.
- [x] Single-player mode, effective rates, and composite difficulty reviewed with real scroll at all three resolutions; footer always accessible.

Exit criteria:

- [x] A new user can configure common settings without knowing which INI file contains each setting.
- [x] An experienced administrator keeps direct, reliable access to the raw files.
- [ ] Navigation can grow without becoming a flat list or an unmanageable table.

### Mandatory design review per iteration

Before marking an iteration complete:

- [x] Visual test of the real build per `docs/visual-testing.md` at `1280×720`, `1920×1080`, and `2560×1440` (Iteration 2: `scripts/visual-iter2-review.cjs`).
- [x] Clarity: the screen is understood in under five seconds.
- [x] Hierarchy: the most important thing is the most visible.
- [x] Actions: the primary action stands out and secondaries do not compete.
- [x] Consistency: existing patterns and components are reused.
- [x] Spacing: sections breathe without wasting space.
- [x] Scalability: the design supports more servers and settings.
- [x] Professionalism: no placeholders, simulated content, or provisional finishes visible in active flows (placeholders for unmigrated routes stay outside the exit criteria).

## Current tests and verification
- [x] Unit tests green.
- [x] Typecheck green.
- [x] Build green.
- [ ] Electron app launch smoke E2E.
- [ ] Formal E2E suite for create / clone / delete server.
- [ ] E2E of bootstrap + start + stop with a real ASA binary.
- [ ] E2E of safe update with real rollback.

## Validation performed (current status)
- Validation date: 2026-07-23.
- Commands run:
	- `npx vitest run src/renderer/src/app/AppProviders.test.tsx src/renderer/src/app/AppShellLayout.test.tsx src/renderer/src/features/servers/components/ServerForm/ServerForm.test.tsx src/renderer/src/features/servers/components/ServerCard/ServerCard.test.tsx src/renderer/src/features/overview/OverviewPage.test.tsx`: OK.
	- `npx vitest run src/renderer/src/features/steamcmd/SteamCmdPage.test.tsx`: OK.
	- `npx vitest run src/renderer/src/features/logs/LogsPage.test.tsx`: OK.
	- `npx vitest run tests/unit/ini-model.test.ts src/renderer/src/features/server-workspace/ServerWorkspacePage.test.tsx`: OK.
	- `npm run typecheck`: OK.
	- `npm run build`: OK.
	- `npm run e2e:smoke` and `npm run e2e`: fail due to Electron install in the environment.
- Criterion applied: each check was marked `[x]` only when current functional evidence exists; partial or misaligned implementation is `[-]`; no evidence or broken is `[ ]`.

## Recommended next priority
1. Functional **Backups** page (backend already exists); then Clusters and Settings.
2. When `CURSEFORGE_API_KEY` is available: replace mods mock with the official client; discovery/updates/cluster afterward.
3. Deferred: split `ConfigurationEditor`, final distribution icon, RCON in advanced console.

## Maintenance rule
- Whenever a task is completed, update this file in the same change.
- If priority changes by user decision, reflect it here.
- If a task is split, add subtasks instead of losing detail.
