# SteamCMD and server updates

How YARK installs, updates, and verifies ASA dedicated-server files via SteamCMD,
and how “update available” is decided.

## Intent

- Share one SteamCMD + content cache across many server installs.
- Keep per-server worlds/INI/players intact when syncing game files.
- Make explicit **Update** / **Verify** always talk to Steam (no stale cache reuse).
- Run **safe update** with auto-stop, pre-update backups, conditional restart, and
  automatic rollback on failure.

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
| UI | `src/renderer/src/features/settings/*` (path/install), `steamcmd` progress dock, Overview cards, workspace SidePanel |

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
2. **Robocopy** cache → server `installDir`, excluding `ShooterGame\Saved` (worlds, INI, players).
3. If robocopy fails → fallback: SteamCMD `app_update` **directly** on the server install dir.

| Action | Public constraint | After success |
| --- | --- | --- |
| Install files | Prefer a stopped server (UI blocks while active) | Leaves process state alone |
| Update | May run while active; manager coordinates stop. Blocked only while a stop+backup is in progress | Restarts and waits up to **90s** for healthy `running` **only if** it was running when the job started; otherwise left stopped |
| Verify | Same auto-stop/restart contract as update (no pre-update backup / rollback) | Restarts only if it had been running when the job ran |

Jobs are queued (`criticalJobsQueue.v1` in app settings): up to **3** attempts,
**5s** between transient retries. Pending and replay-safe jobs resume after an
app restart; interrupted update/process-transition phases are blocked for
operator review. See [Critical job crash recovery](critical-job-recovery.md).

### Safe update + rollback

```text
wasRunning = process is active at job start
  → if wasRunning: stop({ backup: false })   # no pre_stop snapshot
  → create pre_update backups (world + players + ini)
  → SteamCMD update + robocopy sync
  → if wasRunning: start + waitForHealthy (90s)
  → on any failure after backups exist:
       restore each pre_update backup
       → if wasRunning: start + waitForHealthy (90s)
       → rethrow (job fails / may retry up to 3 times)
```

`wasRunning` is captured once at the beginning of the job. A server that was already
stopped stays stopped after success; rollback also leaves it stopped. An active
server is restarted after success, or after a successful rollback.

An active-server update must produce exactly one stable `pre_update` archive set and
**must not** also create a `pre_stop` set for the same job (SteamCMD paths pass
`{ backup: false }` into stop). See [backups.md](backups.md).

Pre-update archives use backup type `pre_update` and kinds `world` / `players` / `ini`
(`CRITICAL_BACKUP_KINDS`). Per-server update logs land under userData `update-logs/` as
`{serverId}-{timestamp}.log`.

## Update availability (not SteamCMD)

| Signal | Source | Used for |
| --- | --- | --- |
| Local Steam build | `{installDir}/steamapps/appmanifest_2430930.acf` → `build N` | Compare |
| Public Steam build | `https://api.steamcmd.net/v1/info/2430930` (public branch `buildid`) | Compare |
| Official ARK Version | Wildcard `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini` | **UI only** |

`isServerUpdateAvailable` / `getServerUpdateState` compare **Steam builds only**. Never treat runtime `ARK Version` vs an official/live server version as an update decision — staggered ASA rollouts make those non-equivalent.

Official version and official build each cache for **15 minutes** in-process (`OFFICIAL_VERSION_TTL_MS`). `servers:installation` accepts `forceOfficialCheck` to bypass (used by **Check for updates** and **Check installs**). The status line is also parsed for network state (`Online` / `Deploying` / `Offline`); Deploying tints the sidebar version and shows a pulsing indicator.

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

`installed` remains `health === "ready"`. Results include `reasonCodes`, `guidance`, and `checkedAt` (shown in workspace Status and attention details). Cadence: **one-shot background scan after Overview first paint**, plus on-demand **Check installs** (and post-SteamCMD refresh). Fleet scans stay FS/manifest-only (no PowerShell VersionInfo / log tails) and yield between profiles. Heartbeats still skip deep local inspect; the 5‑minute official poll only re-reads locals when official metadata or the server set changes.

Windows e2e (manual — not in Linux CI): seed KB-scale FS fixtures and assert Overview attention / CTAs:

```bash
npm run build && npm run e2e:install-health
```

Requires a display and `ELECTRON_RUN_AS_NODE` unset. Fixtures under `C:\asa-e2e` are removed on success.

## Public IPC

| Channel | Purpose |
| --- | --- |
| `servers:install-files` | Queue base-file install for a server |
| `servers:update-now` | Queue safe update (auto-stop / conditional restart; no manual stop required) |
| `servers:verify-files` | Queue integrity verify (same auto-stop/restart contract; no pre_update) |
| `servers:installation` | Installation snapshot + official build/version |
| `steamcmd:status` | Path, caches, busy/progress/queue |
| `steamcmd:console` | In-memory console lines (`limit`, default 200) |
| `steamcmd:install` | Download/extract/validate SteamCMD (PowerShell + steamcdn zip) |
| `steamcmd:cancel` | Kill active SteamCMD/sync; drain related work |
| `steamcmd:set-path` | Validate + persist `steamcmd.exe`; resets content-cache freshness |
| `steamcmd:open-cache` | Open depot or ASA content cache folder in Explorer |
| `steamcmd:clear-cache` | Empty depot or ASA content cache (blocked while busy) |
| `logs:read-update` / `logs:open-update-file` / `logs:delete-update` / `logs:clear-updates` | Per-server update log files |
| **Push** `push:steamcmd-progress` | Live `{ status, console }` while ops run |

UI entry points: sidebar **SteamCMD** page + floating progress dock; Overview install/update/verify; workspace SidePanel; onboarding “Install files”. Update/verify stay enabled while the server is running (tooltip explains auto-stop); they lock only while SteamCMD is busy or a stop+backup is in progress.

## Progress

Live progress combines SteamCMD stdout `%` lines with disk estimates (`steamcmd-disk-progress.ts`: depot/downloading sizes under `force_install_dir`). The floating progress dock (and per-server Logs → Updates history) subscribe to `push:steamcmd-progress`. SteamCMD path/install live under **Settings**; cache folders are shown there as read-only paths with Open / Clear (blocked while a job runs).

Update / Verify controls stay enabled while the server is running: Overview cards and
the workspace SidePanel tooltips explain that the manager will auto-stop for SteamCMD
and restart only if the server was running. Byte/`%` detail belongs in the progress
dock, not in those lock tooltips.

Spawns always pass `-language english` (plus `LANG`/`LC_ALL` env) so bootstrapper lines stay English for a single-language parser. SteamCMD otherwise follows the Windows UI language (e.g. Spanish “Descargando archivos…”). Bracket `[ N%]` still updates the percent even if OS localizes; labels/KB pairs are English-only.

During **robocopy** (`sync-files`), progress is a **separate phase**: SteamCMD success may reach 100%, then the dock switches to an **indeterminate** (full striped/animated) bar with the copy label — no byte totals (robocopy runs with progress silenced). A console heartbeat every 5s confirms the job is still running. Sync uses `/MT:4` and below-normal process priority so the Electron UI keeps some disk headroom. While a job is busy, the renderer skips frequent `servers:installation` polls (those do sync PowerShell VersionInfo reads) and refreshes the install snapshot once when the job finishes.

> Note: agent-context historically said “live log streaming during SteamCMD is pending.” The **console/progress push channel and dock are live**. What may still feel incomplete is richer per-file update-log streaming in the Logs UI—not the SteamCMD progress path.

## SteamCMD bootstrap

`steamcmd:install` uses PowerShell to fetch `https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip`, extract next to the app SteamCMD dir, and validate the exe. This path is **Windows-oriented** (PowerShell + `robocopy.exe` for sync). Linux cloud VMs can run the Electron UI and unit tests, but real SteamCMD install/sync against ASA binaries is a Windows host concern.

## Troubleshooting

| Symptom | Likely cause / next step |
| --- | --- |
| `Server stop and backup are still in progress` | Wait for the stop+backup job to finish, then retry update/verify |
| Update/verify while the server is running | Expected — manager stops without `pre_stop`, takes `pre_update` (update only), runs SteamCMD, restarts if it was running |
| Update “available” looks wrong vs ARK Version string | Compare Steam `buildid` only; ARK Version is informational |
| Repeated downloads when installing another server | Cache older than 15 minutes, missing manifest, or SteamCMD path changed |
| Console in Spanish / stuck `0.0%` while `[ N%]` lines scroll | SteamCMD bootstrapper follows Windows UI language. We force `-language english`; percent still reads from `[ N%]`. Restart the update after this build. |
| World/INI wiped after update | Should not happen via robocopy path (`ShooterGame\Saved` excluded); check whether fallback direct `app_update` on install dir was used (console mentions cache sync failure) |
| Update failed then server restarted on old files | Expected rollback using `pre_update` backups — inspect Updates log + Backups history |
| Job stuck after crash | Queue persisted in settings `criticalJobsQueue.v1`; resumes on next launch |
| `steamcmd:install` fails on Linux agent VM | Expected — PowerShell installer + Windows sync tools |

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

Requires: Node 22.5+ (`node:sqlite`), Playwright (devDependency), a built app under
`out/`, and a disposable ASA profile. See [Helper script](#helper-script) below.

### Prerequisites

- Windows host with a working SteamCMD path configured in YARK Settings.
- A **test-owned or disposable** ASA server profile (unique game/query/RCON ports;
  admin password ≥ 4 characters). Do not use an operator production world unless you
  accept snapshot/rollback risk.
- Enough disk for SteamCMD cache + one `pre_update` set (world/players/ini).
- Note expected duration (SteamCMD validate + robocopy can take many minutes).
- Cleanup: leave operator-owned installs untouched; delete only profiles/paths you created for the run.

### Scenarios

| # | Scenario | Pass criteria |
| --- | --- | --- |
| A | Active-server update | Stop → exactly one `pre_update` set (world/players/ini) → **no** `pre_stop` for this job → start + healthy |
| B | Stopped-server update | Completes; server left stopped |
| C | Forced failure after backup | Points Settings at a **temporary** failing SteamCMD stub under `os.tmpdir()` (does **not** rename AppData `steamcmd.exe`). Job may retry up to **3** times with rollback each attempt; final user-visible signal is update **failure** (events include `update_failed` / `update_rolled_back`), never success. If rollback itself fails: logs/backups preserved + clear manual-recovery events |
| D | Cancel mid SteamCMD or sync | Reported cancelled (not success) |
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
