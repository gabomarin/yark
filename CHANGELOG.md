# Changelog

All notable changes to **YARK server manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

How to bump versions and cut releases: see [docs/versioning.md](docs/versioning.md).

## [Unreleased]

### Added

- **Decomposition map** for oversized backend services and renderer pages — phased boundaries, test inventory, and PR checklist ([#146](https://github.com/gabomarin/yark/issues/146)).
- Pure **backup cleanup planner** module (`backup-cleanup-plan.ts`) extracted from `backup-service.ts` with unit tests ([#146](https://github.com/gabomarin/yark/issues/146)).
- **Backup fleet health** helpers extracted to `backup-fleet.ts` (health badges, alerts, disk stats) with unit tests ([#146](https://github.com/gabomarin/yark/issues/146)).
- Pure **backup restore** helpers (`backup-restore.ts`) extracted from `backup-service.ts` — map folder selection, file filters, players layout checks — with unit tests ([#146](https://github.com/gabomarin/yark/issues/146)).
- Pure **backup portability** helpers (`backup-portability.ts`) plus tolerant `parseBackupManifest` in `backup-archive.ts`, extracted from `backup-service.ts` with unit tests ([#146](https://github.com/gabomarin/yark/issues/146)).
- Pure **backup critical-job** helpers (`backup-critical-jobs.ts`) — phase/status checks, merge, load disposition, retry plan — extracted from `backup-service.ts` with unit tests ([#146](https://github.com/gabomarin/yark/issues/146)).
- Pure **update critical-job** helpers (`update-critical-jobs.ts`) — queue ordering, cancel/pause eligibility, merge/load/resume phase — extracted from `update-service.ts` with unit tests ([#146](https://github.com/gabomarin/yark/issues/146)).
- Pure **SteamCMD path** helpers (`steamcmd-path.ts`) — candidate paths, cached resolve, install script, verify-exit — extracted from `update-service.ts` with unit tests ([#146](https://github.com/gabomarin/yark/issues/146)).

### Changed

- Async busy/spinner cleanup across the renderer uses shared **`runWithFinally`** so React Compiler can optimize those surfaces when enabled; verbose build skips drop from ~74 to ~55 CompileError (#404).

## [0.15.0] - 2026-08-22

### Added

- Optional Windows toasts when a server crashes, a SteamCMD install/update/verify finishes or fails, or a YARK update is available/ready — even if YARK is in the tray; Settings → General **Desktop alerts** covers crash, installs/updates, YARK updates, and hide-to-tray. Success banners stay quiet; failures and crashes use the system sound (#331).
- **Discover mods** browses CurseForge on open with category filter and pagination (in-field search icon / Enter to submit); catalog sort is table column headers (Name / Downloads / Updated) across the full result set, with Clear sort back to Popularity; table scrolls inside the panel with a fixed pagination footer; category list fails soft if the proxy Worker is not yet updated (#297).

### Changed

- Operator-facing copy drops em dashes for sentence punctuation or en dashes, uses `…` in loading placeholders, and prefers **Close** / **Finish** over bare **Done** where the label was vague (#402).
- React Doctor baseline documented (`docs/react-doctor.md`, root `doctor.config.json`); leave-guard and sequential-job rules treated as intentional noise, not mass-fixed (#403).
- Content panels (Clusters, fleet Logs/Backups, Settings content, workspace Server / INI / Launch / Logs / Backups) share **`AppSurfaceCard tone="flat" radius="md"`**; cool wash is no longer the page-shell default (#346).
- Dense icon-only row actions (backup history Restore/Delete, cluster member Promote/Restore/Remove, Logs clear/delete, Downloads Resume/Retry/Pause/Cancel, minimized SteamCMD Cancel) use **`variant="subtle"`** so columns stay quiet; labeled destructive **Button**s stay red **filled**; workspace server list drops Add/Import (use Overview instead) (#397).
- Disabled **Server mods** rows are dimmed (thumb + text) while the Enabled switch stays full strength so off-list mods read as not live; row **Remove** stays red **subtle** (not filled) so the actions column stays quiet (#226, #297).
- Destructive labeled buttons (**Stop**, Force close, Delete, Remove, Ban, cancel jobs) use red **filled** (`--app-color-bad`); workspace lifecycle **Restart** uses deep amber **filled** (`--app-color-fossil-filled`, white icon via autoContrast) (#344).

### Fixed

- ScrollArea / Select dropdowns no longer show a **double** scrollbar (native viewport bar + Mantine overlay); short lists keep `type="auto"` so chrome appears only on overflow (#395).
- SQLite boot/snapshot unit tests no longer flake on CI when `PRAGMA quick_check` or VACUUM snapshots exceed Vitest’s default 5s timeout under parallel load.
- **Start** and **Restart** show immediate Starting… / Restarting… feedback on Overview cards and the workspace header while pre-spawn work runs, so the UI no longer sits idle for ~2s (#390).

## [0.14.1] - 2026-08-19

### Fixed

- Overview **ServerCard** Compact density keeps a denser row when the window narrows; Comfortable-only stacking no longer overrides Compact (#377).
- ASA launch-options catalog uses one list scrollbar, explains browse filters on hover/focus, and tells operators where YARK already manages a command instead of showing `extraArgs` audit tokens (#381).
- Move install, copy configuration, INI save/discard/reset, Logs export/clear/delete, and log-retention cleanup use operator toasts instead of lingering success banners; leftover-folder and failure Alerts stay (#240).

### Changed

- Operator toasts render **bottom-right** so they do not cover Overview and workspace toolbars (#240).
- Workspace search and related inputs (INI, player backups, cluster INI template, ASA catalog, Mods Discover / add URL, RCON command, **Logs** fleet filter) share **SearchField** chrome so filters match Overview and Launch (#379).
- INI **GameUserSettings / Game** and **Visual / Text** switchers use the same compact segmented control as Overview **All servers / By cluster**, with icon + visible labels (#379).

## [0.14.0] - 2026-08-19

### Added

- Workspace **Launch** tab search filters curated ASA flags by token, description, or group while keeping Extra arguments and the command preview visible (#352).
- Overview **Update all outdated** previews stopped servers with ready installs, then queues safe SteamCMD updates into Downloads after confirm (#378).
- Servers Overview and workspace server rail share **Order added** vs **A–Z** sort and icon-only **All servers / By cluster** layout toggles; preferences persist across reload (#351).
- **Downloads** queue page with stacked job rows, active vs queued separation, shared server-card progress styling, `Open in Logs` focus on the related Events entry, and Pause/Resume for install and update jobs; workspace footer teaser on other pages replaces the floating progress dock. getyark.com gallery and SteamCMD docs include the queue (#201).

### Changed

- Overview fleet summary, sort/view controls, and search share one header row until ~1280px; grouped cluster headings no longer show a lone server count (#351).
- Server card and workspace **Stop** use a red **Stop** icon; **Restart** uses **fossil** to match lifecycle controls elsewhere.
- Overview, Settings, Clusters, Backups, Logs, and Downloads drop restating page subtitles; fleet backup KPIs stay hidden only when there is no history and no enabled schedule; status badges use sentence case; server cards give map art more room, a quieter stopped state that still differs from Inactive, and square list rows with a straight status rail (no notch or gap) that tighten in Compact.
- Overview server cards show read-only queue/progress status; click the progress line (e.g. **Paused · Updating server**) to open **Downloads** (pause, resume, and cancel stay on the Downloads page). The status badge keeps server runtime state only. Queued servers look distinct, lock Start, toast when added to Downloads, and refuse duplicate clicks (#201, #378).
- Downloads workspace footer on other pages is a read-only minified SteamCMD bar (inline copy, wider progress); click opens **Downloads** — pause/resume stay on that page (#201).
- Downloads workspace footer keeps the last known SteamCMD percent while a job is paused instead of clearing it (#201).
- Downloads **Queued** rows stack flush with dividers only between rows (#201).
- Downloads uses a vertical splitter with a horizontal rule: queue list above and a console-only SteamCMD card below (#201).
- Downloads console keeps SteamCMD output while a job is **Paused** and clears it on **Resume** (#201).
- Closing YARK mid-job keeps that server under **Active** with **Retry** (queue waits); only a failed Retry moves it to **Needs attention** (#201).
- Queued Downloads detail copy reflects queue order (second job waits for the first queued server, not only the active one) (#201).
- Queued Downloads rows slide when you **Move up / Move down** (#201).
- One files job per server: **Update** or **Install** replaces a queued **Verify**; a running job is never interrupted. Verify will not queue on top of Update/Install (#201).
- Overview fleet action label is **Update All** (was **Update all outdated**).
- Overview **Update All** confirm copy no longer uses first-person voice (#378).
- Overview **Update All** preview drops the green **Queue** badge on eligible servers; **Skip** stays on blocked rows (#378).
- Overview **Update All** server list uses native overflow so scrollbar arrows do not show when everything fits (#378).
- Overview **Update All** confirm button label is **Accept** (#378).
- Restart-interrupted Downloads jobs keep the last SteamCMD console output visible until Retry (#378).
- Queued Downloads rows show the operation only (e.g. **Updating server**), not internal checkpoint phases like pre-update backup (#201).
- **Pre-update backup** no longer appears as a duplicate Downloads row during safe updates; cancelled shadow jobs are purged on load (#201).
- Downloads **Cancelled** rows use the same flush stacked list styling as **Queued** (#201).

### Security

- Packaged YARK builds no longer honor a `YARK_DEVTOOLS` env override; DevTools stay off until you run an unpackaged dev/preview build.

### Fixed

- Downloads queue rows no longer nest Pause/Cancel buttons inside the row select control (invalid HTML nesting).
- Overview **Update all outdated** refresh keeps the enable state and preview consistent, enqueues into Downloads without waiting for SteamCMD to finish, and closes the confirm modal as soon as queueing completes (#378).
- Overview server cards no longer show an animated progress bar for queued or paused jobs; only live SteamCMD work shows progress (#378).
- Cancelling a queued job no longer starts the next server while another job is paused (#201).
- Overview **Update All** header enable state stays live while the confirm modal is open (#378).
- Downloads **SteamCMD is not installed** banner no longer collapses to a thin strip when the queue has rows (#378).
- SteamCMD queue status pushes immediately when the queue stops on a paused or restart-interrupted job (#201).
- Merging duplicate recovered Downloads jobs preserves **restartInterrupted** so the queue still waits for Retry (#201).
- Profile DB migration adds an index on `servers(created_at, id)` so default **Order added** list loads stay fast as fleets grow (#351).
- Cancelling the active SteamCMD job no longer cancels other queued Downloads work; the next job starts after unwind (#201).
- Cancelled Downloads jobs offer **Retry** (row, detail, and footer) as well as Dismiss; Install/Update/Verify still replace a cancelled leftover of the same job (#201).
- **Move up / Move down** in Downloads actually changes which queued job runs next (the list no longer resorted by created time) (#201).
- File jobs wait as **blocked** with Retry when SteamCMD is missing, instead of starting and failing into backup leftovers. Retry/Resume/Update also explain that SteamCMD must be installed first and keep the existing job (#201).
- Pending Downloads resume when YARK starts if SteamCMD is ready and nothing is **Paused**; they stay blocked with Retry if SteamCMD is not. Retry and Resume probe disk again after that miss so a later SteamCMD install is not stuck (#201).
- Pause during rollback or Verify refuses with a yellow toast instead of cancelling the job (#201).
- Paused install/update cards keep **Paused · Installing files** (or the matching operation) after a YARK restart instead of **Updating files…** (#201).
- Verify files uses **Cancel** instead of Pause — SteamCMD `validate` has no resume checkpoint and would restart at 0% (#201).
- **Show server console on start** now applies to Auto-start with YARK (stored in app settings so it survives quit). Auto-start waits until the main window is shown so dedicated-server consoles do not open over the splash (#350).

## [0.13.1] - 2026-08-17

### Changed

- Sidebar **YARK update** icon and version text use fossil amber so the available-update cue matches other warn accents.

### Fixed

- Home screenshot slideshow serves native 1440px WebP at higher quality so the product preview stays sharp on large and high-DPI displays.

## [0.13.0] - 2026-08-17

### Added

- Profile-owned **Max players** (default 70, 0–255) on create/edit; applied at start as `-WinLiveMaxPlayers` only. ASA ignores GameUserSettings.ini `MaxPlayers` (the visual editor hides those keys; cluster templates strip them). Empty or **0** omits the flag (ASA then defaults to 70).
- **Clone server** copies **Game.ini** and **GameUserSettings.ini** from the source (new ports and session name overwrite identity keys) and can optionally copy the full install folder (off by default; unavailable when the source has no files). The source must be stopped for a folder copy; large copies show progress and can be cancelled, and a failed copy removes the incomplete clone (#160).
- Skippable **first-run setup** (SteamCMD, Windows shell, optional cluster, then create or import); Settings can reopen the setup assistant (#298).
- Mods detail drawer can **enable/disable** and **Remove** configured IDs, **Add to this server** from Discover inspect, and shows a Maps launch-token hint without changing the current map (#227).

### Changed

- Workspace **Mods** uses the same flat panel shell as Server Settings and Launch, and Discover search uses the shared search field (#238).
- Configuration wizard: calm profile cards with Phosphor icons, Cancel with step actions and Back beside Continue, **Match cluster defaults** (full template Seed/Restore with pace skip), and **Use default configuration** on first-run create (#230).
- Configuration wizard Pace colors rate presets and world-difficulty tiers (Very easy–Very hard → levels 30–150), marks WildCard-matching presets with **WildCard official**, and exposes INI keys behind **INI details** (#230).
- Configuration wizard **World** step uses Current → Very easy…Very hard (official **Base**), drops Max players from presets (profile field only), and retunes density / survival / night values (#230).
- Configuration wizard QoL: easy-oriented profiles enable **AlwaysAllowStructurePickup** (disables the pickup timer field); draft/review rows show the real INI key and hide the changes modal button on Review (#230).
- Configuration wizard Pace adds **resource respawn**; Breeding scales cuddle/imprint with maturation for reachable 100% imprint; QoL adds cave building (PvE) and floating damage text (#230).
- Configuration wizard Profile: **Enable single-player settings** with stack/bonuses copy in that alert (no second Multipliers stack alert) (#230).
- Mods **Add** toasts **Mod Added** (new Project IDs start disabled; at most two of those toasts stay visible). Disabled inventory rows use a quieter background; row hover uses the cool control tint so the enable switch stays readable. The inventory **Downloads** column is count-only; CurseForge category sits as a compact badge under the mod name (Maps uses attention color; extra tags as +N with a hover list) (#226).
- Configuration wizard chrome uses shared selection, radius, and spacing tokens; Pace difficulty keys sit behind an **INI details** tooltip (#224).
- Settings uses a **category sidebar** (General, Servers, SteamCMD, Logs, About); setup guidance clarifies saved changes, suggests a cluster folder, and prevents conflicting SteamCMD actions while work is active (#298).
- getyark.com serves responsive WebP screenshots, preloads the home logo, and skips heavy motion work on phones so the static site loads faster.

### Fixed

- Upgrade keeps a leftover Launch/extra `-WinLiveMaxPlayers` cap on the new **Max players** field instead of silently starting at 70.
- Configuration wizard Review no longer lists structure pickup time when **Always allow structure pickup** is on (that timer is not written).
- Clone port +10 wraps within 1024–65535 so Clone stays usable near the top of the range.
- First-run cluster **Yes** shows the directory error when no default base folder is set, and the suggested folder follows a later base-folder change.
- Clone INI seed and optional folder copy fail closed when the destination (or a parent) is a Windows directory junction.
- Shell main content stays in the viewport after Mantine `styles.layer.css` — navbar modules no longer override AppShell fixed positioning (#230).
- INI preview validates leftover **Max players** on `[/Script/Engine.GameSession]` and `[ServerSettings]` if present; wizard apply toasts the preview change count (#230).
- The INI editor hides `MaxPlayers` because ASA ignores that INI key; **Max players** on the Server tab is the live cap (`-WinLiveMaxPlayers`). Raw text mode explains the split (#230).
- First-run setup does not auto-open when setup status cannot be read, so Overview stays usable if the database is unavailable (#298).

### Security

- Recursive install/backup/move/cache copies no longer follow Windows directory junctions; write paths fail closed on parent or destination links before mkdir/copy (#322).

## [0.12.0] - 2026-08-13

### Added

- Animated **startup splash** from `brand/splashscreen.svg` (1.5s min, until main is ready) on the same display as the restored window; honors reduced motion and does not block boot if splash assets fail; skipped during E2E (#317).
- In-app **What's new** changelog (Settings, sidebar version click, one-shot after upgrade) from the curated notes shared with the public site (#290).
- Create/clone **install folder** must be empty (or missing) and must not sit inside or wrap another YARK or ASA server, including unmanaged ASA parents.

### Changed

- Operator docs record a real-host **cluster transfer** checklist (two maps, items/dinos/survivor, restart, return trip) (#22).
- Runtime **ShooterGame.log** tail stays on with native console; the buffer is kept after a crash and cleared on the next Start; unexpected process exits record `server_crashed` with a bounded ShooterGame.log excerpt (#326).
- Operator docs and marketing SEO: long-tail doc titles, richer SoftwareApplication schema (screenshots/features, no review stars), clearer favicons, GitHub About at getyark.com, and a short **why YARK exists** origin on the site and README (#305).
- README hero adds cumulative GitHub Release **downloads** and a static **prerelease** status badge (#304).
- Incomplete cluster directories and create/add-cluster summary folders use the same **ReadonlyPath** chips as Settings (#234).
- Compact **UI density** shrinks workspace Add server / rail icons, INI open-file, and sidebar SteamCMD controls that were stuck at md/lg (#233).
- Create/edit **server form** paths use the same Browse chip as Settings (no typed install/cluster paths) (#222).
- **Create/edit server** form uses AppSurfaceCard identity + reachability columns in the app shell and workspace tab, a reserved port-conflict slot, and a fixed Create server / Save changes footer (#292).
- **New server** Map is official maps only; Custom… stays on edit, import, and clone (#292).
- Workspace, Settings auto-start, and Logs fleet empties use the shared **EmptyState** shell; backup and RCON action toasts go through `showOperatorToast` / `showOperatorError` (#223).
- **Log retention** day fields accept a minimum of 1 day (was 7).
- YARK updates **Download** and **Restart and install** use fossil amber instead of teal, so the CTA is easier to read on the dark shell.

### Fixed

- **Move installation** on the same drive renames the folder back if cancel or commit fails after the rename, so the profile is not left pointing at an empty source while files sit at the destination.
- Safe update resume/rollback accepts legacy pre-update jobs that still list a `players` backup id, so world+INI evidence is enough after the critical-path change.
- Workspace **Server** and **INI Files** confirm before leaving unsaved edits (fossil alert, Save and continue); Server tab shows Cancel when dirty (#299).
- Create/edit server forms confirm before app-shell navigation (sidebar, Spotlight, YARK update badge) discards unsaved profile changes (#292).
- Create/Move install-path checks walk ASA ancestors on disk (not only a `ShooterGame` dest segment) and stay async so a slow UNC folder cannot freeze YARK.
- **Move installation** dest preview matches create (empty folder, not another YARK or ASA tree), blocks dest inside or wrapping the current install, can create `base\<current-folder>` like Create, and keeps Start disabled if dest probe fails (#294).

## [0.11.0] - 2026-08-12

### Added

- **Import anyway** opt-in for incomplete ASA folders: adopt the path as a YARK profile and finish with Install/Verify; empty folders stay blocked (#283).
- **Remove from YARK only** when deleting a server: keep the ASA install folder on disk, or choose **Delete everything** for a full wipe; empty never-installed folders skip the choice and always wipe, with a live emptiness recheck before wipe (#267).

### Changed

- **Player backups** are join/leave only: flat profile files under `PlayerProfiles/`, restore into the current map folder, no manual “Backup all players” / Players Import; critical-path snapshots are world + INI (#275).

### Fixed

- Resizing the window no longer resets the server **Backups** kind tab (World save / Player profiles / INI) to World save (#271).
- Server update controls stay disabled while the server is active; queued jobs recheck before touching files and stay **Retry**-able after Stop (#277).
- **Add servers to cluster** starts with nothing selected, lists only enabled unclustered servers, accepts idle **Error**-state servers (confirmed dead child), and leaves **Seed INI** unchecked until the operator opts in (#276).

## [0.10.0] - 2026-08-12

### Added

- Profile SQLite **snapshots** before schema migrations and after each healthy reopen of an existing DB; boot recovery can **Restore snapshot** (preferred) instead of only starting empty (#252).
- **Import install** wizard adopts an existing ASA dedicated folder as a YARK profile (no SteamCMD, no INI writes until Start); discovers mods disabled; blocks already-managed folders (#254).
- Windows CI runs Electron **E2E** smoke, CRUD suite, install-health, and host-port-probe with isolated app data; validation matrix in `docs/e2e-validation.md` (#12).

### Security

- Packaged Windows builds enable Electron fuses and ASAR integrity validation (no RunAsNode / Node CLI inspect / `NODE_OPTIONS`; load only from integrity-checked `app.asar`). **`grantFileProtocolExtraPrivileges` stays on** while the shell loads the renderer via `loadFile` (#217).

### Changed

- **World backups** are per active map (`SavedArks/{MapToken}/` or mod folders without `_WP`, e.g. `Svartalfheim/`): omit dated autosaves, name ZIPs with the map token, retain last-N per map, overlay restore with optional profiles/tribes, and filter history to the current map by default (#262).
- Scheduled world backups wait a full `intervalMinutes` after the process becomes active before the first attempt; history table columns are **File**, **Map** (world only), **Date** (was When), then Size/Status/Type/Actions — players tab uses **Player** (name + id) instead of File; column sort (Date newest-first by default) and resizable widths (#262).
- World schedule gates on the last **finished** scheduled attempt (success or fail), pauses further scheduled creates for the YARK session after 3 consecutive failures (no policy change), supports custom-map **World save folder** override, and lets operators **Clear failed** history rows (#262).
- Public site and operator docs no longer highlight code signing / Authenticode as near-term roadmap; download trust stays on official sources and SHA-256 checks (#142).

### Fixed

- Packaged builds keep **`grantFileProtocolExtraPrivileges`** enabled so `loadFile` can open the renderer (blank window / `ERR_FILE_NOT_FOUND` on `app.asar/.../index.html` when the fuse was off) (#217).
- World restore after a wipe recreates the **live** map folder from the backup manifest (mod maps like `Svartalfheim/`), not a mistaken `{MapToken}` directory; empty live maps skip the pre-restore safeguard so recovery can proceed (#262).
- **Import install** map detection scans nested `SavedArks` folders even when the folder name is not a MapToken (#254).
- Harden world-backup map paths and make folder overrides, current-map selection, and all-failed history cleanup behave safely and predictably (#262).
- Hide the native Electron application menu bar (File/Edit/View/Help); quit remains on the system tray.
- Packaged Windows builds report publisher/author as **gabomarin26** (was Gabriel).
- Safe **Update** shows console/progress while creating pre-update backups, Cancel aborts that work (and pre-restore safeguards) instead of hanging on “Waiting for progress…”, and skips rollback restore when SteamCMD never changed game files.
- **YARK updates** keep a finished or in-progress download when Check now or the quiet startup check runs again, so Restart and install no longer disappears behind Download.

## [0.9.1] - 2026-08-10

### Added

- Optional **Cloudflare Web Analytics** beacon on the public site (`PUBLIC_CF_WEB_ANALYTICS_TOKEN` at Pages build time).
- Engineering runbook for workspace **Mods** (CurseForge inventory, load order, metadata proxy, and `-mods=` launch) in `docs/mods.md`.

### Fixed

- Release CI no longer flakes on `execFileBounded` maxBuffer coverage: the test drives Node stdout overflow on all platforms instead of a slow PowerShell spawn on Windows runners.

### Changed

- Sidebar shows an **update** icon next to the YARK version when an app update is available, and centers the SteamCMD status label.
- Public website roadmap highlights operator-facing work after v0.9.0 (import install, signing, SteamCMD queue, RCON whitelist, port suggestions, optional assistant).
- Public site canonical origin is **https://getyark.com** (GitHub Pages custom domain) with Astro `base: "/"` so assets and docs resolve at the domain root.
- Marketing SEO: home H1, richer SoftwareApplication JSON-LD, FAQPage schema, docs BreadcrumbList, and sitemap `lastmod`.

## [0.9.0] - 2026-08-10

### Added

- Local Electron loads gitignored `.env` / `.env.local` for `YARK_CURSEFORGE_PROXY_URL` so CurseForge metadata works in `npm run dev` / `start` without relying on Windows User env inheritance (#151).
- Corrupt or unopenable **profile database** shows a boot recovery dialog (open folder / quit / start empty). YARK does not repair the file; start empty quarantines it and continues with a blank DB. Open also uses a short lock wait and `quick_check` (#218).

### Changed

- Public docs cover profile-database boot recovery; marketing roadmap refreshed for work after v0.9.0 (#218).
- Launch and Mods profile saves use narrow `updateServerPatch` IPC with server-side merge and per-server write serialization so concurrent panel edits no longer last-write-wins (#209).
- Overview server cards skip re-render on unrelated status polls via a memoized card and a stable fleet action bag; focused cards open the row menu with Shift+F10 (#209).

### Fixed

- Settings **YARK updates** and **Log retention** clear busy state even when the underlying IPC call fails, so controls do not stick disabled.
- Website build no longer warns about a duplicate `/404` route; GitHub Pages keeps a single `404.html` from `website/src/pages/404.astro` (#149).
- Electron main hot paths (fleet install inspect, crash reattach, stop/kill, SteamCMD discovery/cancel) use bounded async I/O instead of sync filesystem and child-process calls (#145).
- Overview status heartbeat no longer re-fetches the server profile list; Logs fleet and workspace Backups quiet polls stop resetting UI from host refresh identity churn (#163).
- Workspace tab crashes show a recoverable panel error instead of blanking the whole app shell (#209).

### Security

- YARK update **Open release notes** only calls `shell.openExternal` after the shared host allowlist check (same policy as `target=_blank`) (#216).
- Official CurseForge proxy URL is no longer a source fallback; release builds bake it from a protected Actions variable (#151).
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
