# Backups

Local, kind-scoped backup and restore for ASA dedicated-server installs.
New archives are **ZIP files** under a per-server destination root. Legacy
loose-folder archives still restore and can be imported from disk.

## Intent

Protect three content scopes independently:

| Kind | Live source | Paths inside the archive |
| --- | --- | --- |
| `world` | `{installDir}/ShooterGame/Saved/SavedArks` | `SavedArks/` (full folder, including profiles) |
| `players` | `.arkprofile` / `.arkprofile.bak` / `.profilebak` under `SavedArks` and `SaveGames` | `PlayerProfiles/` |
| `ini` | `Game.ini` + `GameUserSettings.ini` in `Config/WindowsServer` | `ConfigWindowsServer/` |

Triggers are separated on purpose:

- **World schedule** — policy `enabled` + `intervalMinutes` (world only; server must be active).
- **Player join/leave** — always-on `PlayerSessionWatcher` (not gated by schedule).
- **INI-on-save** — debounced after successful `ini:save` (not on the world schedule).
- **Critical path** — queued pre-update / restore jobs (retries survive app restart).

## Module map

| Role | Path |
| --- | --- |
| Service | `src/backend/domains/backups/backup-service.ts` |
| ZIP helpers | `src/backend/domains/backups/backup-archive.ts` |
| Portable UI helpers | `src/renderer/src/features/backups/backupPortability.ts` |
| Disk / volume helpers | `src/backend/domains/backups/backup-disk.ts` |
| Scheduler (60s tick) | `src/backend/domains/backups/backup-scheduler.ts` |
| Player sessions | `src/backend/domains/backups/player-session-watcher.ts` |
| `ListPlayers` parse | `src/backend/domains/backups/list-players.ts` |
| Persistence | `src/backend/infra/db/backup-repository.ts` |
| Player note helpers | `src/shared/backup-player-meta.ts` |
| Contracts | `src/shared/types.ts`, `src/shared/ipc.ts` |
| IPC | `src/main/ipc-handlers.ts`, `src/preload/index.ts` |
| UI (all servers / sidebar) | `src/renderer/src/features/backups/BackupsPage.tsx` |
| UI (per-server) | `src/renderer/src/features/backups/ServerBackupPanel.tsx` |
| UI (history table) | `src/renderer/src/features/backups/BackupHistoryTable.tsx` (`YarkDataTable`) |

Bootstrap wires the scheduler and watcher in `src/main/index.ts`.

## Policy defaults and constraints

`BackupPolicy` (`src/shared/types.ts`):

| Field | Default | Constraint |
| --- | ---: | --- |
| `enabled` | `false` | Schedule creates **world** backups only |
| `intervalMinutes` | `60` | Minimum **5** |
| `retainCountWorld` | `20` | 1–500 |
| `retainCountPlayers` | `20` | 1–500; **per-player** pools (full snapshots share `__all__`) |
| `retainCountIni` | `10` | 1–500 |
| `backupDir` | `null` | `null` → `{installDir}\Backups` |

Schema column `retain_days` is legacy and unused (always written as `14`).

Example policy write (IPC / UI draft — omit `serverId` / `updatedAt`):

```ts
{
  enabled: true,
  intervalMinutes: 30,
  retainCountWorld: 10,
  retainCountPlayers: 15,
  retainCountIni: 8,
  backupDir: "D:\\ASA\\MyServer\\Backups", // or null for default
}
```

## On-disk layout

```text
{backupRoot}/
  World/
    {server}-{kind}-{type}-{YYYYMMDD-HHmmss}.zip
  Player profiles/
    {server}-{kind}-{type}-{player?}-{YYYYMMDD-HHmmss}.zip
  INI/
    {server}-{kind}-{type}-{YYYYMMDD-HHmmss}.zip
```

New archives put a compact local date stamp (`YYYYMMDD-HHmmss`) at the **end** of
the filename (before `.zip`), after the server slug and kind/type. Portable
exports use the same stamp style.
Each ZIP is built from a staging directory that includes `manifest.json` plus
the kind payload (`SavedArks/`, `PlayerProfiles/`, or `ConfigWindowsServer/`).
Legacy flat layout (archives directly under `{backupRoot}`) and loose folders
are still scanned on reconcile.

Zip extract rejects zip-slip paths. Listeners are registered **before**
`readEntry()` so empty archives that emit `end` synchronously under
`lazyEntries` still resolve (see `extractZip` in `backup-archive.ts`).

## Disk ↔ DB reconcile

`list` / `getFleetSummary` call `reconcileDiskBackups` (serialized per server):

1. Drop DB rows whose archive path is gone (skip `running` / keep `failed` history).
2. Import `.zip` and legacy folder archives present on disk but missing from SQLite.
3. Reuse `manifest.json` backup `id` when free; **mint a new id** when that id is
   already in the DB (copied archives must not collide).

## Public IPC

Channels in `src/shared/ipc.ts` (preload wrappers return `IpcResult<T>`):

| Channel | Args | Returns |
| --- | --- | --- |
| `backups:list` | `serverId`, `limit?` (service clamps 1–200) | `BackupRecord[]` |
| `backups:create` | `serverId`, `kinds?: BackupKind[]` | `BackupRecord[]` |
| `backups:delete` | `serverId`, `backupIds` | `number` deleted |
| `backups:restore` | `serverId`, `backupId` | `void` |
| `backups:get-policy` / `backups:set-policy` | policy fields | `BackupPolicy` |
| `backups:resolve-root` | `serverId` | `string` |
| `backups:open-folder` / `backups:open-root` | ids | `void` |
| `backups:export` | `serverId`, `backupId`, `destinationPath` | exported ZIP path |
| `backups:import` | `serverId`, `kind`, `sourcePath` | `BackupRecord` (catalog only) |
| `backups:fleet-summary` | — | `BackupFleetSummary` |
| `backups:get-disk-alert-settings` / `backups:set-disk-alert-settings` | thresholds | settings |
| `backups:preview-cleanup` / `backups:run-cleanup` | cleanup options | preview / result |

Related (not under `backups:*`):

- `ini:save` → best-effort `createIniSaveBackup` (errors swallowed in the handler).
- `logs:list` includes backup rows in operational logs.
- Push: `push:backups-changed` (`BackupChangedPush` with `serverId`).
- Events: `backup_created`, `backup_deleted`, `backup_restored` (plus `error` on failures).

Internal only (no dedicated `backups:*` IPC): scheduled create, player-session
create, pre-update queue, `createPreStopBackup` (from `InstanceService.stop`),
and `createPreRestartBackup` (from `InstanceService.restart` / `servers:restart`).

## Workflows

### Create / restore require Ready install

Manual create, schedule, player-session, INI-on-save, and restore all require
installation health **Ready** (`ArkAscendedServer.exe` present). The Backups tab
stays available for list / export / import / delete so operators can stage
portable archives before Install finishes.

### Manual create

1. Workspace **Backups** tab calls `createManualBackup(serverId, [activeKind])`.
2. Service runs `flushWorldIfActive` (RCON `SaveWorld` when the process is active; failures are ignored).
3. Each requested kind is packaged into a ZIP; empty **per-player** session archives are discarded.
4. Empty world packages fail (no essential save data) instead of writing an unusable archive.
5. If `kinds` is omitted/empty on the API, all three kinds are created. The UI always passes one kind.

### Portable export / import

Move recovery archives between disks or hosts without changing live server files:

1. **Export** (`backups:export`) copies a `completed` managed archive to a
   user-chosen path (`fs:pick-path` kind `save`). ZIP archives are copied as-is;
   legacy folder archives are zipped into the destination. The managed original
   is never modified.
2. **Import** (`backups:import`) validates a portable ZIP for the selected kind,
   then copies it under `{backupRoot}/{kind subdir}/` with a unique generated
   name (never silent overwrite) and inserts a `completed` SQLite row.
3. Validation rejects corrupt archives, zip-slip / absolute entry paths,
   symlink entries, missing kind payload roots (`SavedArks/`, `PlayerProfiles/`,
   or `ConfigWindowsServer/`), and `manifest.json` kind mismatches.
4. Import **never** restores. Operators restore later with the normal restore
   flow. If the DB insert fails after the copy, only the newly copied ZIP is
   removed.

### Pre-stop backup

User stop (`servers:stop` via `InstanceService.stop`):

1. RCON `SaveWorld` + wait.
2. RCON `DoExit` + wait for the exact managed process. A replacement process is
   never touched; an external process exit is treated as already stopped.
3. `createPreStopBackup` with `skipFlush: true` creates `pre_stop` archives for
   **world**, **players**, and **ini**.
   Packaging happens after exit so the source files remain stable.
4. Progress phases push on
   `push:server-stop-progress` (overview card + workspace alert).
5. Backup failure is best-effort — the already-stopped server remains stopped
   and a warning event is recorded.
6. Stop is single-flight per server. Start, Force close, update, verify, and
   application close are blocked or wait while the stop backup is active.
7. SteamCMD update/verify and atomic restart pass `{ backup: false }` so this
   path does not create a `pre_stop` snapshot. Kill and app-quit `stopAll` skip
   this path.

### Pre-restart backup

User restart (`servers:restart` via `InstanceService.restart`):

1. Reject if the server process is not active; hold lock purpose `"restart"`.
2. Stop with `{ backup: false }` (SaveWorld / DoExit, no `pre_stop`).
3. `createPreRestartBackup` with `skipFlush: true` creates `pre_restart`
   archives for **world**, **players**, and **ini**.
4. Backup failure is **fail-hard** — start is not called; the server stays
   stopped.
5. On success, start with the same options as `servers:start` (including
   native console preference from the renderer).
6. One snapshot per restart (no nested pre-stop). See
   [server-lifecycle.md](server-lifecycle.md).

### Restore

1. Backup must be `completed`; server must **not** be active (`ProcessManager.isActive`).
2. A same-kind `pre_restore` safeguard backup is created first.
3. ZIP archives extract to a temp staging dir; legacy folders are used in place.
4. Apply:
   - **world** — replace live `SavedArks` (profiles included; INI untouched).
   - **players** — overlay from `PlayerProfiles/` (legacy: profiles inside `SavedArks`); does not wipe unrelated live profiles.
   - **ini** — copy present `Game.ini` / `GameUserSettings.ini` into live config.
5. Restore history is written to SQLite; there is **no** list IPC/UI for it yet.

UI restore is direct. Update rollback uses the queued `restoreBackupForJob` path.

### World schedule and retention

- `BackupScheduler` ticks every **60s** → `runScheduledCycle`.
- Overlapping ticks are coalesced (one cycle at a time). While a world backup is
  **running** or a scheduled create is in-flight for that server, further scheduled
  creates are skipped so long archives cannot stack.
- Policy, retention, or reconciliation failures are recorded per server and do not
  prevent the remaining servers from being evaluated during the same cycle.
- Before treating a persisted `running` row as active, the scheduler reconciles
  interrupted work from a previous app process so a crash cannot block future backups;
  this recovery is serialized with UI and cleanup reconciliation.
- Every cycle applies retention for each server.
- Creates only when `enabled`, interval elapsed since latest **completed world** backup (or none yet), and process is active.
- Creates **world only**.
- World packaging copies `SavedArks` file-by-file: skips `.arkrbf` / `.tmp` up front,
  keeps every primary map `.ark`, and retains only the **2 newest dated autosaves**
  per map (e.g. `Map_WP_DD.MM.YYYY_….ark`). Missing essential primary `.ark` / tribe /
  profile data still fails the backup. World/players ZIPs use **light deflate
  (level 1)** for `.ark` / profile blobs (faster than default level 6); `manifest.json`
  and other small files still use default deflate.
- Retention keeps the last N **completed** backups per kind; players are split by `playersRetentionKey`. Failed rows are not pruned by retain counts. Cannot delete `running` backups.

### Backup health and alerts (all servers)

`getFleetSummary` / sidebar **Backups** page:

- **Stale** / **never backed up** fleet alerts only apply when the schedule is on
  **and** the process is active. Stopped servers are not warned for an elapsed
  interval or a missing first world backup — scheduled world backups do not run
  while inactive (health stays `unknown` until a world archive exists or the
  server is running with schedule on).
- Stale threshold: last completed world backup older than `intervalMinutes × 1.5`.
- Health: `critical` (missing destination or world failures in 24h) → `warning`
  (stale / never-backed-up **while active**, or non-world failures) → `unknown`
  (no world backup yet and schedule off or server stopped) → `ok`.
- Disk alerts use settings key `backupDiskAlerts.v1` (defaults: warn 85% / critical 95% / free under 20 GiB).
- Fleet alerts render in a compact scrollable **Alerts** panel (not stacked full-width banners), with short action buttons (Open / Logs / Cleanup / Dismiss).
- **Dismiss** stores a fingerprint under `backupFleetAlerts.dismissed.v1` and hides that alert until the fingerprint changes (new failed backup, updated disk usage bucket, new stale world stamp, etc.).

### Sidebar Backups quiet refresh

`BackupsPage` listens to `push:backups-changed` and reloads with `{ quiet: true }`:

- Refreshes the all-servers summary without flipping the page loading spinner.
- Does **not** overwrite in-progress policy or disk-alert draft edits.
- Reloads when the **server id set** changes (not on every App `listServers` poll
  identity), and non-quiet loads keep dirty drafts unless **Refresh** uses
  `forceDraftSync`.
- Initial load and explicit Refresh remain non-quiet (Refresh resets drafts from server).

### Player sessions

`PlayerSessionWatcher` always starts with the app (no policy disable flag):

- Polls RCON `ListPlayers` every **10s** while status is `running`.
- Immediate tick on process status `running` / `stopping` / `stopped` / `error`.
- First successful snapshot **seeds** the online set (no backups for already-present players).
- Join → `player_connect`; leave → `player_disconnect`.
- Leaving `running` flushes remaining online players as disconnects.
- SavedArks profile mtime scan creates disconnect-type backups for offline players when files appear/change (covers short sessions RCON missed).
- Dedup window **90s**; empty/null result clears dedup so a retry can happen.
- Disconnect packaging retries up to **8 × 400ms** for late disk flush; profile stem match is **exact** after lowercasing and stripping `eos:`.

Session notes look like:

```text
[playerKey=76561198000000000] [playerName=Alice] Player connected: Alice (76561198000000000)
```

### INI-on-save

After a successful `ini:save`, `createIniSaveBackup` debounces **2s** per server and writes type `ini_save`, kind `ini`.

### Pre-update critical queue

- Key: `backupCriticalJobsQueue.v1` in app settings.
- Types: `pre-update-backup` | `restore`; max **3** attempts, **5s** delay; survives restart.
- Interrupted pre-update backups reconcile their job-marked rows/ZIPs and resume
  from the next missing kind. Restore outcomes remain blocked with Retry/Dismiss
  actions instead of being replayed blindly. See
  [Critical job crash recovery](critical-job-recovery.md).
- Pre-update creates **world + players + ini** (`CRITICAL_BACKUP_KINDS`).
- Safe update stops with `{ backup: false }` first, then creates this set — an
  active-server update must **not** also produce a `pre_stop` archive set for the
  same job. Acceptance and real-host checklist:
  [updates-steamcmd.md](updates-steamcmd.md#real-host-validation-windows).

## UI surfaces

- **Sidebar → Backups** — cross-server health, schedule / destination / retention, disk alerts, cleanup; “Open in server” jumps to the workspace tab.
- **Server Workspace → Backups** — kind subtabs (**World save** | **Player profiles** | **INI**), create/restore/history for that server.
- Destination and schedule controls live primarily on the World subtab; Players/INI keep compact retain controls near history.
- **Backup history** uses shared **`YarkDataTable`** (`mantine-datatable`) for selection, density, and empty/loading; row actions and right-click menus stay on `backupHistoryRowActionModel` (#94).

## Troubleshooting

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| Hot backup looks stale | `SaveWorld` failed or RCON unreachable | Profile `rconPort` / `adminPassword`; process must be active for flush |
| No scheduled backups | Policy off, interval not elapsed, or server not running | `enabled`, `intervalMinutes`, runtime status |
| Stopped server shows “never backed up” / stale | Bug if still present — health should ignore inactive processes | Confirm build includes process-active gating in `getFleetSummary` |
| Missing player session archive | Short session + RCON miss, or profile not flushed | Watcher mtime safety net; disconnect wait; exact player-key stem |
| Restore rejected | Server still active or backup not `completed` | Stop the server; only completed backups restore |
| Empty ZIP restore hangs | Listeners must be registered before `readEntry` | `extractZip` in `backup-archive.ts` |
| Copied archive missing / wrong id | Manifest id already in DB | Reconcile mints a new id when the manifest id is taken |
| Retention not shrinking | Failed / running rows | Only **completed** backups count toward retain N |
| Empty player session backup missing from history | By design | Empty per-player archives are deleted so they do not consume retention |
| Sidebar draft fields reset while editing | Non-quiet reload from App poll | Reload keyed by server ids; dirty drafts kept unless Refresh forces sync |

## Common pitfalls

- World restore **replaces all SavedArks**, including profiles.
- Player-session backups **cannot be disabled** via policy today.
- `SaveWorld` is best-effort — backups proceed even when RCON fails.
- Manual UI creates one kind; API without `kinds` creates all three.
- `rootBackupDir` passed into `BackupService` from main is unused for snapshot roots; policy `backupDir` / `{installDir}\Backups` wins.
- No incremental or offsite sync; packaging is full ZIP per kind.
- Do not document restore-history as a product surface until list IPC/UI exists.

## Verification

```bash
npm test -- backup
npm run typecheck
```

Key unit coverage: `tests/unit/backup-service.test.ts`, `player-session-watcher.test.ts`,
`list-players.test.ts`, `backup-repository.test.ts`, `backup-player-meta.test.ts`,
and archive helpers under `tests/unit/` matching `backup-archive`.

Renderer smoke: `src/renderer/src/features/backups/*.test.tsx`. For visible UI
changes, follow [visual-testing.md](visual-testing.md)
(`scripts/visual-backups.cjs` exists for Playwright review).
