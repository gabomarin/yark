# Profile database (SQLite boot + recovery)

YARK persists server profiles, settings, backups metadata, and related state in
a local SQLite file under Electron `userData`:

`yark-server-manager.db`

## Boot open

`src/backend/infra/db/database.ts` `openDatabase`:

1. Opens (or creates) the file via `node:sqlite` `DatabaseSync`.
2. Sets `PRAGMA busy_timeout = 5000` so transient locks wait briefly instead of
   failing immediately.
3. Enables WAL + foreign keys.
4. When an **existing** on-disk DB has pending schema migrations, writes a
   **pre-migrate** snapshot (#252) before applying them.
5. Applies pending schema migrations transactionally (`PRAGMA user_version`).
6. Rejects an existing on-disk file that is empty or shorter than the SQLite
   header (SQLite would otherwise treat a 0-byte file as a new empty DB).
7. Runs `PRAGMA quick_check` (and a smoke read of `app_settings` when present) so
   page-level corruption that still allows file open fails here — not later in
   service constructors with an unhandled rejection. Full quick_check dumps go to
   the main-process log; the recovery dialog shows a short summary only.
8. When the file **already existed** before this open, writes a **healthy-boot**
   snapshot (#252) after the checks pass (every successful reopen; brand-new DBs
   skip snapshots).

Open vs migration failures throw `DatabaseBootError` with `kind: "open" | "migrate"`.
A failed required snapshot is treated as a boot error (migrations do not run without
a pre-migrate snapshot when an on-disk DB already exists).

## Profile DB snapshots (#252)

Known-good copies are taken **before** corruption or a bad migration — not after
#218 detects failure. Snapshots use SQLite `VACUUM INTO` so WAL state is included
without a naive mid-write copy of `.db` alone.

| Item | Value |
| --- | --- |
| Directory | `<userData>/profile-db-snapshots/` (beside `yark-server-manager.db`) |
| Names | `yark-profile.pre-migrate.<stamp>.db`, `yark-profile.healthy-boot.<stamp>.db` |
| Retention | Last **3** files per kind (oldest deleted after each write) |
| Triggers | Pre-migrate when pending migrations + existing file; healthy-boot after every successful open of an existing file |
| Restore | **Manual** today — copy a snapshot over `yark-server-manager.db` (and remove stale `-wal`/`-shm`) while YARK is quit. Automatic restore UX is out of scope for #252. |

#218 **Start empty** remains the in-app fallback when the live DB cannot open and the
operator does not (or cannot) restore a snapshot by hand.

## Operator recovery (#218)

`src/main/database-boot-recovery.ts` wraps boot open. On failure, a native dialog
offers:

| Action | Behavior |
| --- | --- |
| Quit | Exit without changing files (`app.exit(1)`) |
| Open folder | `shell.showItemInFolder` on the DB path (copy for support; not a repair) |
| Start empty… | Move the broken file aside + reopen a blank DB (no second confirm) |

Start empty renames the main DB and `-wal` / `-shm` sidecars to
`*.corrupt.<timestamp>` next to the original path (no silent delete), then
creates a new empty database. That keeps a copy of the broken file on disk, but
YARK does **not** repair or reload profiles from it. ASA game install directories
are untouched — the operator re-adds servers in YARK if needed.

## Module map

| Role | Path |
| --- | --- |
| Open + migrate + busy_timeout + snapshot hooks | `src/backend/infra/db/database.ts` |
| Snapshot write + rotation | `src/backend/infra/db/database-snapshots.ts` |
| Quarantine rename helpers | `src/backend/infra/db/database-recovery.ts` |
| Recovery dialog loop | `src/main/database-boot-recovery.ts` |
| Boot wiring | `src/main/index.ts` (`whenReady`) |

## Tests

| File | Focus |
| --- | --- |
| `tests/unit/database-boot-recovery.test.ts` | busy_timeout, typed errors, quarantine, recovery choices |
| `tests/unit/database-snapshots.test.ts` | VACUUM INTO snapshot, rotation, pre-migrate / healthy-boot triggers |

Related: [settings.md](settings.md#app-data-folders),
[critical-job-recovery.md](critical-job-recovery.md) (queue quarantine pattern).
