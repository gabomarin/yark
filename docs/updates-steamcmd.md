# SteamCMD and server updates

How YARK installs, updates, and verifies ASA dedicated-server files via SteamCMD,
and how “update available” is decided.

## Intent

- Share one SteamCMD + content cache across many server installs.
- Keep per-server worlds/INI/players intact when syncing game files.
- Make explicit **Update** / **Verify** always talk to Steam (no stale cache reuse).
- Run **safe update** with pre-update backups and automatic rollback on failure.

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
| Install files | No “must be stopped” gate | Leaves process state alone |
| Update | Throws if process is active (`Stop the server before update`) | **Always starts** the server and waits up to **90s** for healthy `running` |
| Verify | Throws if process is active (`Stop the server before verify`) | Restarts only if it had been running when the job ran |

Jobs are queued (`criticalJobsQueue.v1` in app settings): up to **3** attempts, **5s** between retries; pending jobs resume after app restart.

### Safe update + rollback

```text
pre-update backups (world + players + ini)
  → stop if somehow still active
  → SteamCMD update + sync
  → start + health (90s)
  → on failure: restore pre-update backups → start + health
```

Pre-update archives use backup type `pre_update` and kinds `world` / `players` / `ini` (`CRITICAL_BACKUP_KINDS`). Per-server update logs land under userData `update-logs/` as `{serverId}-{timestamp}.log`.

## Update availability (not SteamCMD)

| Signal | Source | Used for |
| --- | --- | --- |
| Local Steam build | `{installDir}/steamapps/appmanifest_2430930.acf` → `build N` | Compare |
| Public Steam build | `https://api.steamcmd.net/v1/info/2430930` (public branch `buildid`) | Compare |
| Official ARK Version | Wildcard `https://cdn2.arkdedicated.com/asa/officialserverstatus.ini` | **UI only** |

`isServerUpdateAvailable` / `getServerUpdateState` compare **Steam builds only**. Never treat runtime `ARK Version` vs an official/live server version as an update decision — staggered ASA rollouts make those non-equivalent.

Official version and official build each cache for **15 minutes** in-process (`OFFICIAL_VERSION_TTL_MS`). `servers:installation` accepts `forceOfficialCheck` to bypass.

## Public IPC

| Channel | Purpose |
| --- | --- |
| `servers:install-files` | Queue base-file install for a server |
| `servers:update-now` | Queue safe update (server must be stopped) |
| `servers:verify-files` | Queue integrity verify (server must be stopped) |
| `servers:installation` | Installation snapshot + official build/version |
| `steamcmd:status` | Path, caches, busy/progress/queue |
| `steamcmd:console` | In-memory console lines (`limit`, default 200) |
| `steamcmd:install` | Download/extract/validate SteamCMD (PowerShell + steamcdn zip) |
| `steamcmd:cancel` | Kill active SteamCMD/sync; drain related work |
| `steamcmd:set-path` | Validate + persist `steamcmd.exe`; resets content-cache freshness |
| `logs:read-update` / `logs:open-update-file` / `logs:delete-update` / `logs:clear-updates` | Per-server update log files |
| **Push** `push:steamcmd-progress` | Live `{ status, console }` while ops run |

UI entry points: sidebar **SteamCMD** page + floating progress dock; Overview install/update/verify; workspace SidePanel; onboarding “Install files”.

## Progress

Live progress combines SteamCMD stdout `%` lines with disk estimates (`steamcmd-disk-progress.ts`: depot/downloading sizes under `force_install_dir`). The floating progress dock (and per-server Logs → Updates history) subscribe to `push:steamcmd-progress`. SteamCMD path/install/caches live under **Settings**.

> Note: agent-context historically said “live log streaming during SteamCMD is pending.” The **console/progress push channel and dock are live**. What may still feel incomplete is richer per-file update-log streaming in the Logs UI—not the SteamCMD progress path.

## SteamCMD bootstrap

`steamcmd:install` uses PowerShell to fetch `https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip`, extract next to the app SteamCMD dir, and validate the exe. This path is **Windows-oriented** (PowerShell + `robocopy.exe` for sync). Linux cloud VMs can run the Electron UI and unit tests, but real SteamCMD install/sync against ASA binaries is a Windows host concern.

## Troubleshooting

| Symptom | Likely cause / next step |
| --- | --- |
| `Stop the server before update/verify` | Process still active — stop from Overview/workspace first |
| Update “available” looks wrong vs ARK Version string | Compare Steam `buildid` only; ARK Version is informational |
| Repeated downloads when installing another server | Cache older than 15 minutes, missing manifest, or SteamCMD path changed |
| World/INI wiped after update | Should not happen via robocopy path (`ShooterGame\Saved` excluded); check whether fallback direct `app_update` on install dir was used (console mentions cache sync failure) |
| Update failed then server restarted on old files | Expected rollback using `pre_update` backups — inspect Updates log + Backups history |
| Job stuck after crash | Queue persisted in settings `criticalJobsQueue.v1`; resumes on next launch |
| `steamcmd:install` fails on Linux agent VM | Expected — PowerShell installer + Windows sync tools |

## Verification pointers

```bash
npm test          # includes steamcmd-content-cache / update-related unit tests
npm run typecheck
npm run build
```

On Linux cloud agents, see [AGENTS.md](../AGENTS.md) for expected Windows-path test failures and Electron display notes.
