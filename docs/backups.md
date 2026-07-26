# Backups

Local, kind-scoped backup and restore for ASA dedicated-server installs.
Archives are **directory copies** (not zip), rooted under a per-server destination.

## Intent

Protect three content scopes independently:

| Kind | Live source | Snapshot folder |
| --- | --- | --- |
| `world` | `{installDir}/ShooterGame/Saved/SavedArks` | `SavedArks/` (full folder, including profiles) |
| `players` | `.arkprofile` / `.arkprofile.bak` / `.profilebak` under `SavedArks` and `SaveGames` | `PlayerProfiles/` |
| `ini` | `Game.ini` + `GameUserSettings.ini` in `Config/WindowsServer` | `ConfigWindowsServer/` |

Triggers are separated on purpose:

- **World schedule** — policy `enabled` + `intervalMinutes` (world only).
- **Player join/leave** — always-on `PlayerSessionWatcher` (not gated by schedule).
- **INI-on-save** — debounced after successful `ini:save` (not on the world schedule).
- **Critical path** — queued pre-update / restore jobs (retries survive app restart).

## Module map

| Role | Path |
| --- | --- |
| Service | `src/backend/domains/backups/backup-service.ts` |
| Scheduler (60s tick) | `src/backend/domains/backups/backup-scheduler.ts` |
| Player sessions | `src/backend/domains/backups/player-session-watcher.ts` |
| `ListPlayers` parse | `src/backend/domains/backups/list-players.ts` |
| Persistence | `src/backend/infra/db/backup-repository.ts` |
| Player note helpers | `src/shared/backup-player-meta.ts` |
| Contracts | `src/shared/types.ts`, `src/shared/ipc.ts` |
| IPC | `src/main/ipc-handlers.ts`, `src/preload/index.ts` |
| UI (global) | `src/renderer/src/features/backups/BackupsPage.tsx` |
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
  {ISO-timestamp}-{type}-{kind}[-{playerSlug}]-{serverSlug}/
    manifest.json
    SavedArks/                 # kind=world
    PlayerProfiles/…           # kind=players
    ConfigWindowsServer/…      # kind=ini
```

`manifest.json` records server identity, type/kind, timestamps, and packaging meta.

## Public IPC

Channels in `src/shared/ipc.ts` (preload wrappers return `IpcResult<T>`):

| Channel | Args | Returns |
| --- | --- | --- |
| `backups:list` | `serverId`, `limit?` (handler default 50; service clamps 1–100) | `BackupRecord[]` |
| `backups:create` | `serverId`, `kinds?: BackupKind[]` | `BackupRecord[]` |
| `backups:delete` | `serverId`, `backupIds` | `number` deleted |
| `backups:restore` | `serverId`, `backupId` | `void` |
| `backups:get-policy` / `backups:set-policy` | policy fields | `BackupPolicy` |
| `backups:resolve-root` | `serverId` | `string` |
| `backups:open-folder` / `backups:open-root` | ids | `void` |

Related (not under `backups:*`):

- `ini:save` → best-effort `createIniSaveBackup` (errors swallowed in the handler).
- `logs:list` includes backup rows in operational logs.
- Events: `backup_created`, `backup_deleted`, `backup_restored` (plus `error` on failures).

Internal only (no IPC): scheduled create, player-session create, pre-update queue, `backupThenRestart` / `createPreRestartBackup` (implemented but unwired from callers outside the service).

## Workflows

### Manual create

1. Workspace **Backups** tab calls `createManualBackup(serverId, [activeKind])`.
2. Service runs `flushWorldIfActive` (RCON `SaveWorld` when the process is active; failures are ignored).
3. Each requested kind is packaged; empty **per-player** session archives are discarded.
4. If `kinds` is omitted/empty on the API, all three kinds are created. The UI always passes one kind.

### Restore

1. Backup must be `completed`; server must **not** be active (`ProcessManager.isActive`).
2. A same-kind `pre_restore` safeguard backup is created first.
3. Apply:
   - **world** — replace live `SavedArks` (profiles included; INI untouched).
   - **players** — overlay from `PlayerProfiles/` (legacy: profiles inside `SavedArks`); does not wipe unrelated live profiles.
   - **ini** — copy present `Game.ini` / `GameUserSettings.ini` into live config.
4. Restore history is written to SQLite; there is **no** list IPC/UI for it yet.

UI restore is direct. Update rollback uses the queued `restoreBackupForJob` path.

### World schedule and retention

- `BackupScheduler` ticks every **60s** → `runScheduledCycle`.
- Every cycle applies retention for each server.
- Creates only when `enabled`, interval elapsed since latest **completed world** backup (or none yet), and process is active.
- Creates **world only**.
- Retention keeps the last N **completed** backups per kind; players are split by `playersRetentionKey`. Failed rows are not pruned by retain counts. Cannot delete `running` backups.

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

## UI surfaces

- **Sidebar → Backups** — cross-server schedule / destination / retention; “Open in server” jumps to the workspace tab.
- **Server Workspace → Backups** — kind subtabs (**World save** | **Player profiles** | **INI**), create/restore/history for that server.
- Destination and schedule controls live primarily on the World subtab; Players/INI keep compact retain controls near history. The sidebar page can also edit all three retain counts when a server is expanded.

## Troubleshooting

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| Hot backup looks stale | `SaveWorld` failed or RCON unreachable | Profile `rconPort` / `adminPassword`; process must be active for flush |
| No scheduled backups | Policy off, interval not elapsed, or server not running | `enabled`, `intervalMinutes`, runtime status |
| Missing player session archive | Short session + RCON miss, or profile not flushed | Watcher mtime safety net; disconnect wait; exact player-key stem |
| Restore rejected | Server still active or backup not `completed` | Stop the server; only completed backups restore |
| Retention not shrinking | Failed / running rows | Only **completed** backups count toward retain N |
| Empty player session backup missing from history | By design | Empty per-player archives are deleted so they do not consume retention |

## Common pitfalls

- World restore **replaces all SavedArks**, including profiles.
- Player-session backups **cannot be disabled** via policy today.
- `SaveWorld` is best-effort — backups proceed even when RCON fails.
- Manual UI creates one kind; API without `kinds` creates all three.
- `rootBackupDir` passed into `BackupService` from main is unused for snapshot roots; policy `backupDir` / `{installDir}\Backups` wins.
- No zip, incremental, or offsite sync.

## Verification

```bash
npm test -- backup
npm run typecheck
```

Key unit coverage: `tests/unit/backup-service.test.ts`, `player-session-watcher.test.ts`, `list-players.test.ts`, `backup-repository.test.ts`, `backup-player-meta.test.ts`.

Renderer smoke: `src/renderer/src/features/backups/*.test.tsx`. For visible UI changes, follow [visual-testing.md](visual-testing.md) (`scripts/visual-backups.cjs` exists for Playwright review).
