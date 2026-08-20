# SteamCMD and server updates

How YARK installs, updates, and verifies ASA dedicated-server files via SteamCMD,
and how “update available” is decided.

## Intent

- Share one SteamCMD + content cache across many server installs.
- Keep per-server worlds/INI/players intact when syncing game files.
- Make explicit **Update** / **Verify** always talk to Steam (no stale cache reuse).
- Run **safe update** for stopped servers with pre-update backups and automatic
  rollback on failure.

ASA Steam app id: **`2430930`**.

## Module map

| Role | Path |
| --- | --- |
| Orchestration / queue / progress | `src/backend/domains/updates/update-service.ts` |
| Cache paths, freshness, robocopy sync | `src/backend/domains/updates/steamcmd-content-cache.ts` |
| Disk-based download estimate | `src/backend/domains/updates/steamcmd-disk-progress.ts` |
| Local install snapshot + official build/version | `src/backend/domains/instances/server-installation.ts` |
| Availability compare (`buildid` only) | `src/shared/server-update-status.ts` |
| Contracts | `src/shared/ipc.ts`, `src/shared/types.ts`, `src/shared/steamcmd-progress.ts` |
| IPC | `src/main/ipc-handlers.ts`, `src/preload/index.ts` |
| UI | `src/renderer/src/features/settings/*` (path/install), Downloads page, Overview cards, workspace SidePanel |

## Two caches (next to SteamCMD)

| Cache | Path (under SteamCMD home) | Purpose |
| --- | --- | --- |
| Depot cache | `steamapps/depotcache` | Compressed Steam downloads (network reuse) |
| ASA content cache | `asa_content_cache` | Shared expanded install copied to each server |

SteamCMD home is the directory containing `steamcmd.exe` (or `process.cwd()` if only the bare name is configured).

SteamCMD args always use this order (required by modern SteamCMD):

```text
+force_install_dir <dir> +login anonymous +app_update 2430930 validate +quit
```

`validate` is always passed.

## Content-cache freshness

Constant: `CONTENT_CACHE_FRESH_MS` = **15 minutes** (in-session timestamp + existing `appmanifest_2430930.acf`).

| Operation | Reuses fresh cache? |
| --- | --- |
| `install-files` | Yes, if cache was updated in this session within 15 minutes |
| `update` | **No** — always queries SteamCMD |
| `verify-files` | **No** — always queries SteamCMD |

Changing the SteamCMD path via `steamcmd:set-path` resets the freshness timestamp.

## Install / update / verify

Pipeline for each files job:

1. Ensure `asa_content_cache` (SteamCMD `app_update` … `validate`, unless install reuses fresh cache).
2. **Robocopy** cache → server `installDir`, excluding `ShooterGame\Saved` (worlds, INI, players). Shared helper uses `/E` + `/XJ` (no junction traversal) and refuses destination trees that already contain links (#322).
3. If robocopy fails → fallback: SteamCMD `app_update` **directly** on the server install dir.

| Action | Public constraint | After success |
| --- | --- | --- |
| Install files | Prefer a stopped server (UI blocks while active) | Leaves process state alone |
| Update | Requires the server to be stopped before queueing and again when execution begins | Leaves the server stopped |
| Verify | May run while active; manager coordinates stop (no pre-update backup / rollback) | Restarts only if it had been running when the job ran |

Jobs are queued (`criticalJobsQueue.v1` in app settings): up to **3** attempts,
**5s** between transient retries. Pending and replay-safe jobs resume after an
app restart; interrupted update/process-transition phases are blocked for
operator review. See [Critical job crash recovery](critical-job-recovery.md).

### Safe update + rollback

```text
server is stopped at request and execution time
  → create pre_update backups (world + ini)
  → SteamCMD update + robocopy sync
  → on any failure after backups exist:
       restore each pre_update backup
       → rethrow (job fails / may retry up to 3 times)
```

New update jobs are accepted only while the server is stopped and recheck that state
inside the per-server execution lock. This prevents a queued or resumed job from
updating a server that started while it was waiting. Rollback leaves it stopped.
Legacy jobs that recorded running intent before this policy changed retain their
stop/restart recovery behavior.

An update produces exactly one stable `pre_update` archive set and does not create a
`pre_stop` set for the same job. See [backups.md](backups.md).

Pre-update archives use backup type `pre_update` and kinds `world` / `ini`
(`CRITICAL_BACKUP_KINDS`). Per-server update logs land under userData `update-logs/` as
`{serverId}-{timestamp}.log`.

## Update availability (not SteamCMD)

| Signal | Source | Used for |
| --- | --- | --- |
| Local Steam build | `{installDir}/steamapps/appmanifest_2430930.acf` → `build N` | Compare |
| Public Steam build | `https://api.steamcmd.net/v1/info/2430930` (public branch `buildid`) | Compare |
| Official ARK Version | Wildcard `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini` | **UI only** |

`isServerUpdateAvailable` / `getServerUpdateState` compare **Steam builds only**. Never treat runtime `ARK Version` vs an official/live server version as an update decision — staggered ASA rollouts make those non-equivalent.

Official version and official build each cache for **15 minutes** in-process (`OFFICIAL_VERSION_TTL_MS`). `servers:installation` accepts `forceOfficialCheck` to bypass (used by **Check server updates**, **Update All**, and **Check installs**). The status line is also parsed for network state (`Online` / `Deploying` / `Offline`); Deploying tints the sidebar version and shows a pulsing indicator.

### Fleet update all (#378)

Overview **Update All** (next to **Check server updates**) opens only when at least one outdated server is stopped, enabled, install-ready, and not blocked by Downloads. The preview lists every outdated profile with current vs official Steam build when known, plus skip reasons (running, disabled, install not ready, unknown build, or an existing files job). **Accept** queues one **Update** job per eligible server through the same safe-update pipeline as per-card **Update** — jobs run sequentially in Downloads order; running servers stay skipped until stopped. The header enable state stays live while the modal is open; the modal closes as soon as queueing finishes.

### Installation health (#57)

`inspectServerInstallation` classifies each profile’s install root (lightweight FS only — no hashing / SteamCMD verify):

| `health` | Meaning |
| --- | --- |
| `ready` | Required layout + non-empty `ArkAscendedServer.exe` |
| `missing` | Configured path does not exist |
| `empty` | Directory exists and is empty (valid install target) |
| `incomplete` | Partial ASA tree without the executable |
| `inaccessible` | Permissions/I/O block inspection |
| `suspicious` | Contradictory or unsafe evidence (empty exe, foreign non-ASA contents) |
| `unknown` | Unclassified I/O failure (final result — not “still scanning”) |

`installed` remains `health === "ready"`. Results include `reasonCodes`, `guidance`, and `checkedAt` (shown in workspace Status and attention details). Cadence: **one-shot background scan after Overview first paint**, plus on-demand **Check installs** (and post-SteamCMD refresh). Fleet scans use async FS classification **and** async version/manifest probes with bounded concurrency (no PowerShell / log tails by default). Manual refresh may enrich a ready install that still lacks a cheap version file/manifest. Start/enable gates use the enriched single-server path (async PowerShell VersionInfo when opted in). Heartbeats still skip deep local inspect; the 5‑minute official poll only re-reads locals when official metadata or the server set changes. Main-thread I/O contract: [server-lifecycle.md](server-lifecycle.md#main-process-io-145) (#145).

Windows e2e (manual — not in Linux CI): seed KB-scale FS fixtures and assert Overview attention / CTAs:

```bash
npm run build && npm run e2e:install-health
```

Requires a display and `ELECTRON_RUN_AS_NODE` unset. Fixtures under `C:\asa-e2e` are removed on success.

## Public IPC

| Channel | Purpose |
| --- | --- |
| `servers:install-files` | Queue base-file install for a server |
| `servers:update-now` | Queue safe update for a stopped server; rejects an active process at request or execution time |
| `servers:verify-files` | Queue integrity verify (same auto-stop/restart contract; no pre_update) |
| `servers:installation` | Installation snapshot + official build/version |
| `steamcmd:status` | Path, caches, busy/progress/queue |
| `steamcmd:console` | In-memory console lines (`limit`, default 200) |
| `steamcmd:install` | Download/extract/validate SteamCMD (PowerShell + steamcdn zip) |
| `steamcmd:cancel` | Kill the active SteamCMD/sync process; queued Downloads jobs stay queued and run next |
| `steamcmd:pause` | Stop the active install/update/sync and keep the job checkpointed for Resume. Verify and SteamCMD self-install cannot pause (see below). |
| `steamcmd:set-path` | Validate + persist `steamcmd.exe`; resets content-cache freshness |
| `steamcmd:open-cache` | Open depot or ASA content cache folder in Explorer |
| `steamcmd:clear-cache` | Empty depot or ASA content cache (blocked while busy) |
| `logs:read-update` / `logs:open-update-file` / `logs:delete-update` / `logs:clear-updates` | Per-server update log files |
| **Push** `push:steamcmd-progress` | Live `{ status, console }` while ops run |

UI entry points: **Downloads** page (queue + live console) + Overview / workspace install/update/verify; onboarding “Install files”. Update requires a stopped server. Verify stays enabled while running (tooltip explains auto-stop). Start stays locked while a files job is queued or active. **Update** / **Install** can replace a queued **Verify** for the same server (toast: replaced in the queue — no Needs attention leftover). A running Verify is not cancelled; the operator must cancel it first or wait. Verify on top of Update/Install is refused (“already in Downloads”). Duplicate clicks of the same operation toast “Already in Downloads”. The Overview card shows a queued or busy progress strip.

**Pause** is for install, update, and file copy. Verify is SteamCMD `app_update … validate` with no resume checkpoint, so the UI offers **Cancel** instead — pausing and resuming would restart the scan at 0%. Pause during an in-progress rollback is refused (yellow toast) instead of cancelling. On Downloads, **Pause** / **Cancel** for the active job sit on the Active queue row; queued, paused, cancelled, and needs-attention rows expose their actions on the row as well. Cancel stops only the active SteamCMD job; other queued Downloads rows stay queued and start after unwind. Cancelled jobs stay visible under Needs attention with **Retry** and **Dismiss**. Retry re-queues that job. Clicking Install, Update, or Verify again also replaces a cancelled leftover of the same type. Failed or blocked jobs still need Retry or Dismiss on Downloads.

Queued install/update/verify rows can **Move up in queue** / **Move down in queue**. The displayed queue order is the execution order; those rows slide past each other when you reorder. Arrows hide when only one queued files job exists.

If SteamCMD is not installed, Install/Update/Verify **do not queue**. Pending leftovers from a previous session **block** with Retry so they cannot fail into pre-update backup leftovers. When SteamCMD **is** ready, pending leftovers **resume on launch** unless a **Paused** job or a **Retry**-held interrupt (YARK closed mid-job) is still in the queue.

The lower SteamCMD console follows the **Active** job while one is running and keeps the last output when that job is **Paused**; it clears when you **Resume**.

## Progress

Live progress combines SteamCMD stdout `%` lines with disk estimates (`steamcmd-disk-progress.ts`: depot/downloading sizes under `force_install_dir`). The Downloads page (and per-server Logs → Updates history) subscribe to `push:steamcmd-progress`. SteamCMD path/install live under **Settings**; cache folders are shown there as read-only paths with Open / Clear (blocked while a job runs).

**Safe update** also writes Downloads console lines during the silent-looking pre-update backup phase (world / players / INI packaging and zip), so the console should not sit on “Waiting for progress…” until SteamCMD starts. Cancel during that phase aborts backup critical jobs between kinds and skips rollback restore when SteamCMD never changed game files.

Update controls are disabled while the server is active in Overview cards and the
workspace SidePanel. Verify remains enabled while running; its tooltip explains that
the manager will auto-stop for SteamCMD and restart only if the server was running.
Byte/`%` detail belongs on the Downloads page, not in those lock tooltips.

Spawns always pass `-language english` (plus `LANG`/`LC_ALL` env) so bootstrapper lines stay English for a single-language parser. SteamCMD otherwise follows the Windows UI language (e.g. Spanish “Descargando archivos…”). Bracket `[ N%]` still updates the percent even if OS localizes; labels/KB pairs are English-only.

During **robocopy** (`sync-files`), progress is a **separate phase**: SteamCMD success may reach 100%, then the **Downloads** active job switches to an **indeterminate** bar with the copy label — no byte totals (robocopy runs with progress silenced). A console heartbeat every 5s confirms the job is still running. Sync uses `/MT:4` and below-normal process priority so the Electron UI keeps some disk headroom. While a job is busy, the renderer skips frequent `servers:installation` polls and refreshes the install snapshot once when the job finishes.

> Note: agent-context historically said “live log streaming during SteamCMD is pending.” The **console/progress push channel and Downloads page are live**. What may still feel incomplete is richer per-file update-log streaming in the Logs UI—not the SteamCMD progress path.

## SteamCMD not configured

Creating or importing a **profile** does not require SteamCMD. The record
(map, ports, install path) is saved even when Settings shows **Needs setup**.

**Install files**, **Update**, and **Verify** do. Discovery order: Settings
`steamcmdPath`, `STEAMCMD_PATH`, YARK’s bundled SteamCMD dir, well-known
install paths, then `where.exe steamcmd.exe`. If none exist, queued file jobs
**block** with Retry instead of starting SteamCMD or a pre-update backup.
Pending leftovers resume on launch when that probe finds `steamcmd.exe`. Install
SteamCMD in Settings (or first-run setup), then Retry — or click
Install/Update/Verify again after SteamCMD is ready.

The Overview / workspace **Install files** action is offered from install
health (files missing), not from SteamCMD **Ready**. First-run lets the
operator continue while SteamCMD is still installing.

## SteamCMD bootstrap

`steamcmd:install` uses PowerShell to fetch `https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip`, extract next to the app SteamCMD dir, and validate the exe. This path is **Windows-oriented** (PowerShell + `robocopy.exe` for sync). Linux cloud VMs can run the Electron UI and unit tests, but real SteamCMD install/sync against ASA binaries is a Windows host concern.

## Troubleshooting

| Symptom | Likely cause / next step |
| --- | --- |
| `Server stop and backup are still in progress` | Wait for the stop+backup job to finish, then retry update/verify |
| Update while the server is running | Stop the server first; UI and API reject the request, and queued jobs recheck before execution |
| Verify while the server is running | Expected — manager auto-stops, runs SteamCMD, and restarts if it was running |
| Update “available” looks wrong vs ARK Version string | Compare Steam `buildid` only; ARK Version is informational |
| Version green but number behind Wildcard | Steam is current; label may be from last boot — tooltip on Version explains it refreshes on next start |
| Repeated downloads when installing another server | Cache older than 15 minutes, missing manifest, or SteamCMD path changed |
| Console in Spanish / stuck `0.0%` while `[ N%]` lines scroll | SteamCMD bootstrapper follows Windows UI language. We force `-language english`; percent still reads from `[ N%]`. Restart the update after this build. |
| World/INI wiped after update | Should not happen via robocopy path (`ShooterGame\Saved` excluded); check whether fallback direct `app_update` on install dir was used (console mentions cache sync failure) |
| Console stuck on “Waiting for progress…” during Update | Older builds were silent while zipping pre-update backups (large imported worlds take minutes). Current builds log backup kinds; Cancel aborts that phase without a fake rollback |
| Job stuck after crash | Queue persisted in settings `criticalJobsQueue.v1`; pending jobs resume on next launch when SteamCMD is ready |
| Install failed: *Could not run SteamCMD* | `steamcmd.exe` not found — Choose a path or **Install SteamCMD** in Settings, then retry. Creating the profile itself does not need SteamCMD. |

## Real-host validation (Windows)

Manual release/validation suite for safe update against a real ASA dedicated-server
install. Complements unit tests; **not run in CI**. Broader Windows E2E aggregation
lives under GitHub **#12**.

Quick start (interactive Windows session only):

```powershell
npm run build
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
node scripts/validation/validate-safe-update.cjs --dry-run          # prereq check only
node scripts/validation/validate-safe-update.cjs --confirm          # required gate
# --force is accepted as an alias of --confirm
```

Requires: Node 22.12+ (`node:sqlite` and the current Electron toolchain), Playwright (devDependency), a built app under
`out/`, and a disposable ASA profile. See [Helper script](#helper-script) below.

### Prerequisites

- Windows host with a working SteamCMD path configured in YARK Settings.
- A **test-owned or disposable** ASA server profile (unique game/query/RCON ports;
  admin password ≥ 4 characters). Do not use an operator production world unless you
  accept snapshot/rollback risk.
- Enough disk for SteamCMD cache + one `pre_update` set (world/ini).
- Note expected duration (SteamCMD validate + robocopy can take many minutes).
- Cleanup: leave operator-owned installs untouched; delete only profiles/paths you created for the run.

### Scenarios

| # | Scenario | Pass criteria |
| --- | --- | --- |
| A | Active-server update rejection | API rejects before queueing; no SteamCMD job or update backups; server remains running |
| B | Stopped-server update | Completes; server left stopped |
| C | Forced failure after backup | Points Settings at a **temporary** failing SteamCMD stub under `os.tmpdir()` (does **not** rename AppData `steamcmd.exe`). Job may retry up to **3** times with rollback each attempt; final user-visible signal is update **failure** (events include `update_failed` / `update_rolled_back`), never success. If rollback itself fails: logs/backups preserved + clear manual-recovery events |
| D | Cancel mid SteamCMD or sync | Reported cancelled (not success) |
| D2 | Cancel during pre-update backup (before SteamCMD) | Console shows backup progress; cancel stops without restore/safeguard unwind |
| E | Crash/reopen mid queue | Job recovers as pending; previous error context not silently lost (present queue behavior; checkpoints belong to **#19**) |
| F | Verify while running | Auto-stop/restart; **no** `pre_update` |

### Evidence and closure

Before closing the validation, record (issue comment or PR — do not commit secrets/logs):

- Date, commit/build, host notes (SteamCMD path present, disposable profile name).
- Scenario → pass/fail for A–F.
- Artifacts checked: Updates log under userData `update-logs/`, events (`update_*` /
  `update_rolled_back`), backup types/kinds/IDs, final runtime status.
- Gaps found and fixes applied.
- **Redact** before sharing: no admin passwords, server passwords, or player PII. The
  helper script redacts common password fields in its evidence JSON; still review
  before posting.

Link the filled evidence from GitHub **#12** when used as part of 1.0 readiness.

### Helper script

[`scripts/validation/validate-safe-update.cjs`](../scripts/validation/validate-safe-update.cjs)
is an **interactive manual** runner (Windows + display). It is not part of CI.

| Flag / env | Purpose |
| --- | --- |
| `--confirm` / `--force` | Required for a real run (refuses otherwise) |
| `--dry-run` | Prereq checks only; no Electron launch |
| `YARK_VALIDATE_SERVER_ID` | Override target server id |
| `YARK_VALIDATE_SCENARIOS` | e.g. `C,E,B,A,F,D` |

**Safety:** the script never renames the operator’s real `steamcmd.exe`. Scenario C
compiles a failing stub under `os.tmpdir()`, temporarily sets `steamcmdPath` to that
stub via the app API, then restores the previous path. A real ASA start/stop/update
still mutates the chosen disposable profile (backups, world files) — use a test-owned
install.

Writes `safe-update-validation-evidence.json` under Electron userData. Do not commit
secrets or full SteamCMD logs.

## Verification pointers

```bash
npm test          # includes steamcmd-content-cache / update-service safe-update unit tests
npm run typecheck
npm run build
```

On Linux cloud agents, see [AGENTS.md](../AGENTS.md) for expected Windows-path test failures and Electron display notes.
