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
| Disk / volume helpers | `src/backend/domains/backups/backup-disk.ts` |
| Scheduler (60s tick) | `src/backend/domains/backups/backup-scheduler.ts` |
| Player sessions | `src/backend/domains/backups/player-session-watcher.ts` |
| `ListPlayers` parse | `src/backend/domains/backups/list-players.ts` |
| Persistence | `src/backend/infra/db/backup-repository.ts` |
| Player note helpers | `src/shared/backup-player-meta.ts` |
| Contracts | `src/shared/types.ts`, `src/shared/ipc.ts` |
| IPC | `src/main/ipc-handlers.ts`, `src/preload/index.ts` |
| UI (global / fleet) | `src/renderer/src/features/backups/BackupsPage.tsx` |
| UI (per-server) | `src/renderer/src/features/backups/ServerBackupPanel.tsx` |

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
    {ISO-timestamp}-…-world-….zip
  Player profiles/
    {ISO-timestamp}-…-players-….zip
  INI/
    {ISO-timestamp}-…-ini-….zip
```

Each ZIP is built from a staging directory that includes `manifest.json` plus
the kind payload (`SavedArks/`, `PlayerProfiles/`, or `ConfigWindowsServer/`).
Legacy flat layout (archives directly under `{backupRoot}`) and loose folders
are still scanned on reconcile.

Zip extract rejects zip-slip paths. Listeners are registered **before**
`readEntry()` so empty archives that emit `end` synchronously under
`lazyEntries` still resolve (see `extractZip` in `backup-archive.ts`).

## Disk ↔ DB reconcile

`list` / fleet summary / cleanup prep call `reconcileDiskBackups` (serialized
per server). Order matters:

1. **Interrupted `running` rows** — if a readable backup-layout ZIP exists
   (`isReadableZipArchive` + `zipHasBackupLayout`), promote to `completed` using
   the zip’s **mtime** (not wall clock). Incomplete / non-backup / missing zips
   become `failed`. Live creates in `creatingBackupIds` are left alone.
2. **Prune missing paths** — drop completed rows whose archive path is gone;
   keep `failed` history; skip `running`.
3. **Orphan import** — import `.zip` and legacy folder archives from kind dirs
   and the legacy flat root. ZIP orphans require `zipHasBackupLayout` (manifest
   or known roots). Reuse `manifest.json` backup `id` when free; **mint a new
   id** when that id is already in the DB (copied archives must not collide).

## Public IPC

Channels in `src/shared/ipc.ts` (preload wrappers return `IpcResult<T>`):

| Channel | Args | Returns |
| --- | --- | --- |
| `backups:list` | `serverId`, `limit?` (service clamps 1–200; IPC default often 50) | `BackupRecord[]` |
| `backups:create` | `serverId`, `kinds?: BackupKind[]` | `BackupRecord[]` |
| `backups:delete` | `serverId`, `backupIds` | `number` deleted |
| `backups:restore` | `serverId`, `backupId` | `void` |
| `backups:get-policy` | `serverId` | `BackupPolicy` |
| `backups:set-policy` | `serverId`, policy fields | `BackupPolicy` |
| `backups:resolve-root` | `serverId` | `string` |
| `backups:open-folder` / `backups:open-root` | ids | `void` (`open-folder` opens the parent kind dir for ZIP paths) |
| `backups:fleet-summary` | — | `BackupFleetSummary` |
| `backups:get-disk-alert-settings` / `backups:set-disk-alert-settings` | thresholds | settings |
| `backups:preview-cleanup` / `backups:run-cleanup` | cleanup options | preview / result |

Related (not under `backups:*`):

- `ini:save` → best-effort `createIniSaveBackup` (errors swallowed in the handler).
- `logs:list` includes backup rows in operational logs (see [logs.md](logs.md)).
- Push: `push:backups-changed` (service emits `BackupChangedPush`; shared IPC type
  `BackupsChangedPush` — both carry `serverId`).
- Events: `backup_created`, `backup_deleted`, `backup_restored` (plus `error` on failures).

Internal only (no IPC): scheduled create, player-session create, pre-update queue,
`backupThenRestart` / `createPreRestartBackup` (implemented but unwired from callers
outside the service).

## Workflows

### Manual create

1. Workspace **Backups** tab calls `createManualBackup(serverId, [activeKind])`.
2. Service runs `flushWorldIfActive` (RCON `SaveWorld` when the process is active; failures are ignored).
3. Each requested kind is packaged into a ZIP; empty **per-player** session archives are discarded.
4. If `kinds` is omitted/empty on the API, all three kinds are created. The UI always passes one kind.

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
- Every cycle applies retention for each server.
- Creates only when `enabled`, interval elapsed since latest **completed world** backup (or none yet), and process is active.
- Creates **world only**.
- Retention keeps the last N **completed** backups per kind; players are split by `playersRetentionKey`. Failed rows are not pruned by retain counts. Cannot delete `running` backups.

### Fleet health and alerts

`getFleetSummary` / sidebar **Backups** page (`computeBackupServerHealth`):

| Signal | Gating |
| --- | --- |
| **Stale** | Schedule on **and** process active, and last completed world older than `intervalMinutes × 1.5` (or none yet while active) |
| **`never_backed_up` alert** | Schedule on and no completed world — **including stopped** servers (message hints to start the server so the schedule can run) |
| Health `warning` for no world | Schedule on + no completed world — **not** gated on process active |
| Health `critical` | Bad destination **or** any failed **world** backup in 24h |
| Health `warning` (other) | Any non-critical failures in 24h (INI/players), or stale |
| Health `unknown` | Schedule off and no world backup |

Disk alerts use settings key `backupDiskAlerts.v1` (defaults: warn 85% / critical 95% / free under 20 GiB).

Cleanup: `previewCleanup` / `runCleanup`. Newest world can be protected
(`protectNewestWorld` default **true**). `confirmedBackupIds` are re-checked on
run; cannot delete `running`.

### Fleet UI quiet refresh

`BackupsPage` listens to `push:backups-changed` and reloads with `{ quiet: true }`:

- Refreshes the fleet summary without flipping the page loading spinner.
- Does **not** overwrite in-progress policy or disk-alert draft edits.
- Initial load and explicit Refresh remain non-quiet (reset drafts from server).

Workspace **Backups** auto-refreshes about every **12s** (quiet) plus the push channel.
UI restore is also gated by `opsLocked` (files job in progress); backend restore
only requires the process not active.

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
- Pre-update creates **world + players + ini** (`CRITICAL_BACKUP_KINDS`).
- Safe update stops the server **before** this snapshot when it was running —
  see [updates-steamcmd.md](updates-steamcmd.md).

## UI surfaces

- **Sidebar → Backups** — cross-server health, schedule / destination / retention, disk alerts, cleanup; “Open in server” jumps to the workspace tab.
- **Server Workspace → Backups** — kind subtabs (**World save** | **Player profiles** | **INI**), create/restore/history for that server.
- Destination and schedule controls live primarily on the World subtab; Players/INI keep compact retain controls near history.

## Troubleshooting

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| Hot backup looks stale | `SaveWorld` failed or RCON unreachable | Profile `rconPort` / `adminPassword`; process must be active for flush |
| No scheduled backups | Policy off, interval not elapsed, or server not running | `enabled`, `intervalMinutes`, runtime status |
| Stopped server shows “never backed up” | Expected while schedule is on and no world exists yet | Start the server so the world schedule can run; stale age warnings stay gated on active |
| Missing player session archive | Short session + RCON miss, or profile not flushed | Watcher mtime safety net; disconnect wait; exact player-key stem |
| Restore rejected | Server still active, files job locked, or backup not `completed` | Stop the server; wait for SteamCMD; only completed backups restore |
| Empty ZIP restore hangs | Listeners must be registered before `readEntry` | `extractZip` in `backup-archive.ts` |
| Copied archive missing / wrong id | Manifest id already in DB | Reconcile mints a new id when the manifest id is taken |
| Random `.zip` not imported | Lacks backup layout | Orphan import requires `zipHasBackupLayout` |
| Stuck `running` after crash | Interrupted reconcile | Readable layout zip → completed (mtime); else failed |
| Retention not shrinking | Failed / running rows | Only **completed** backups count toward retain N |
| Empty player session backup missing from history | By design | Empty per-player archives are deleted so they do not consume retention |
| Fleet draft fields reset while editing | Non-quiet reload | Policy/disk drafts refresh only on non-quiet `load()` |

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
`backup-archive.test.ts`, `backup-disk.test.ts`.

Renderer smoke: `src/renderer/src/features/backups/*.test.tsx`. For visible UI
changes, follow [visual-testing.md](visual-testing.md)
(`npm run build && node scripts/visual-backups.cjs`).
