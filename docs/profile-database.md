# Profile database (SQLite boot + recovery)

YARK persists server profiles, settings, backups metadata, and related state in
a local SQLite file under Electron `userData`:

`yark-server-manager.db`

## Boot open

`src/backend/infra/db/database.ts` `openDatabase`:

1. Rejects an existing on-disk file that is empty or shorter than the SQLite
   header (SQLite would otherwise treat a 0-byte file as a new empty DB).
2. Opens (or creates) the file via `node:sqlite` `DatabaseSync`.
3. Sets `PRAGMA busy_timeout = 5000` so transient locks wait briefly instead of
   failing immediately.
4. Enables WAL + foreign keys and reads `PRAGMA user_version`.
5. When an **existing** on-disk DB has pending schema migrations, runs the
   integrity checks and then writes a **pre-migrate** snapshot (#252).
6. Applies pending schema migrations transactionally (`PRAGMA user_version`).
7. Runs `PRAGMA quick_check` again (and a smoke read of `app_settings` when present) so
   page-level corruption that still allows file open fails here — not later in
   service constructors with an unhandled rejection. Full quick_check dumps go to
   the main-process log; the recovery dialog shows a short summary only.
8. When the file **already existed** before this open, attempts a **healthy-boot**
   snapshot (#252) after the checks pass (every successful reopen; brand-new DBs
   skip snapshots; write failures are logged without blocking boot).

Open vs migration failures throw `DatabaseBootError` with `kind: "open" | "migrate"`.
A failed required snapshot is treated as a boot error (migrations do not run without
a pre-migrate snapshot when an on-disk DB already exists). A failed healthy-boot
snapshot is logged but does not block opening a database that already passed its
integrity checks.

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
| In-app restore | Boot recovery dialog offers **Restore snapshot** when copies exist (default). Prefer `pre-migrate` after migrate failures, else newest `healthy-boot`. Broken live file is quarantined as `*.corrupt.*` first. |
| Manual restore | Still possible: copy a snapshot over `yark-server-manager.db` (remove stale `-wal`/`-shm`) while YARK is quit. |

#218 **Start empty** remains available when no snapshot exists or the operator declines restore.

## Operator recovery (#218)

`src/main/database-boot-recovery.ts` wraps boot open. On failure, a native dialog
offers:

| Action | Behavior |
| --- | --- |
| Restore snapshot | When `profile-db-snapshots/` has a usable copy: quarantine the broken DB, copy the preferred snapshot onto `yark-server-manager.db`, reopen (default button when available) |
| Quit | Exit without changing files (`app.exit(1)`) |
| Open folder | `shell.showItemInFolder` on the DB path (copy for support; not a repair) |
| Start empty… | Move the broken file aside + reopen a blank DB (no second confirm) |

Start empty renames the main DB and `-wal` / `-shm` sidecars to
`*.corrupt.<timestamp>` next to the original path (no silent delete), then
creates a new empty database. That keeps a copy of the broken file on disk, but
YARK does **not** repair or reload profiles from it. ASA game install directories
are untouched — the operator re-adds servers in YARK if needed. Prefer
**Import install** (Overview / workspace split button) to point at an existing
ASA dedicated root when #252 snapshots are missing or Start empty cleared the
profile DB — see [server-lifecycle.md](server-lifecycle.md#import-existing-asa-install-254--283).

## Module map

| Role | Path |
| --- | --- |
| Open + migrate + busy_timeout + snapshot hooks | `src/backend/infra/db/database.ts` |
| SQL migration list (app + E2E `initProfileDatabase`) | `src/backend/infra/db/schema-migrations.json` |
| E2E schema seed (no Electron boot) | `scripts/e2e-init-profile-db.cjs` |
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
