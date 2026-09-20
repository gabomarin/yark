# Profile database (SQLite boot + recovery)

YARK persists server profiles, settings, backups metadata, maintenance policies,
and related state in a local SQLite file under Electron `userData`:

`yark-server-manager.db`

Per-server **Maintenance** defaults live in `maintenance_policies` (migration 18+;
days JSON in migration 19). Policies default off; session pause / countdown state
is not persisted — see [maintenance.md](maintenance.md).

Optional community **Ark Server API** Load-on-Start flags live on `servers` as
`use_asa_api` / `use_asa_api_loader` (INTEGER 0/1, default 0). Disk API/plugin
files are under the install Win64 folder, not SQLite — see [asa-api.md](asa-api.md).

Durable **pending Configuration drafts** while a dedicated process is live sit in
`pending_server_ini` (migration 20; #530): one row per `server_id` with both
`GameUserSettings.ini` and `Game.ini` text plus `updated_at` (last save wins).
Flush after stop / before start writes the install files; idle disk saves and
config-transfer / cluster template apply clear the row after materializing both
files when needed. Behavior: [server-lifecycle.md](server-lifecycle.md) (INI
read / save / sanitize). Repository:
`src/backend/infra/db/pending-server-ini-repository.ts`.

Admin and join passwords are ordinary TEXT columns on `servers` (same Windows-user
boundary as `GameUserSettings.ini`). Diagnostic logs omit those settings; they are
not encrypted in the database. Details: [credential-threat-model.md](credential-threat-model.md).

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

### Migration numbering

Migrations are forward-only and keyed on `PRAGMA user_version`: only rows with
`version > current` run. Two consequences:

- Never reuse a version number across parallel PRs. If another PR lands the same
  number first, renumber the later one — a duplicate is skipped, not merged.
- A profile whose `user_version` is **ahead** of the code (for example a dev / isolated
  profile migrated by a different branch) silently skips new migrations, so a table can
  be missing while its IPC handler exists. Align the number with what actually ships, or
  lower that profile's `user_version` so the pending migration runs.

## Profile DB snapshots (#252)

Known-good copies are taken **before** corruption or a bad migration — not after
#218 detects failure. Snapshots use SQLite `VACUUM INTO` so WAL state is included
without a naive mid-write copy of `.db` alone.

| Item           | Value                                                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory      | `<userData>/profile-db-snapshots/` (beside `yark-server-manager.db`)                                                                                                                                           |
| Names          | `yark-profile.pre-migrate.<stamp>.db`, `yark-profile.healthy-boot.<stamp>.db`                                                                                                                                  |
| Retention      | Last **3** files per kind (oldest deleted after each write)                                                                                                                                                    |
| Triggers       | Pre-migrate when pending migrations + existing file; healthy-boot after every successful open of an existing file                                                                                              |
| In-app restore | Boot recovery dialog offers **Restore snapshot** when copies exist (default). Prefer `pre-migrate` after migrate failures, else newest `healthy-boot`. Broken live file is quarantined as `*.corrupt.*` first. |
| Manual restore | Still possible: copy a snapshot over `yark-server-manager.db` (remove stale `-wal`/`-shm`) while YARK is quit.                                                                                                 |

#218 **Start empty** remains available when no snapshot exists or the operator declines restore.

## Operator recovery (#218)

`src/main/database-boot-recovery.ts` wraps boot open. On failure, a native dialog
offers:

| Action           | Behavior                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore snapshot | When `profile-db-snapshots/` has a usable copy: quarantine the broken DB, copy the preferred snapshot onto `yark-server-manager.db`, reopen (default button when available) |
| Quit             | Exit without changing files (`app.exit(1)`)                                                                                                                                 |
| Open folder      | `shell.showItemInFolder` on the DB path (copy for support; not a repair)                                                                                                    |
| Start empty…     | Move the broken file aside + reopen a blank DB (no second confirm)                                                                                                          |

Start empty renames the main DB and `-wal` / `-shm` sidecars to
`*.corrupt.<timestamp>` next to the original path (no silent delete), then
creates a new empty database. That keeps a copy of the broken file on disk, but
YARK does **not** repair or reload profiles from it. ASA game install directories
are untouched — the operator re-adds servers in YARK if needed. Prefer
**Import install** (Overview / workspace split button) to point at an existing
ASA dedicated root when #252 snapshots are missing or Start empty cleared the
profile DB — see [server-lifecycle.md](server-lifecycle.md#import-existing-asa-install-254--283).

## Module map

| Role                                                 | Path                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- |
| Open + migrate + busy_timeout + snapshot hooks       | `src/backend/infra/db/database.ts`                      |
| SQL migration list (app + E2E `initProfileDatabase`) | `src/backend/infra/db/schema-migrations.json`           |
| E2E schema seed (no Electron boot)                   | `scripts/e2e-init-profile-db.cjs`                       |
| Pending live INI drafts (`pending_server_ini`)       | `src/backend/infra/db/pending-server-ini-repository.ts` |
| Snapshot write + rotation                            | `src/backend/infra/db/database-snapshots.ts`            |
| Quarantine rename helpers                            | `src/backend/infra/db/database-recovery.ts`             |
| Recovery dialog loop                                 | `src/main/database-boot-recovery.ts`                    |
| Boot wiring                                          | `src/main/index.ts` (`whenReady`)                       |

## Tests

| File                                        | Focus                                                               |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `tests/unit/database-boot-recovery.test.ts` | busy_timeout, typed errors, quarantine, recovery choices            |
| `tests/unit/database-snapshots.test.ts`     | VACUUM INTO snapshot, rotation, pre-migrate / healthy-boot triggers |

Related: [settings.md](settings.md#app-data-folders),
[critical-job-recovery.md](critical-job-recovery.md) (queue quarantine pattern).
