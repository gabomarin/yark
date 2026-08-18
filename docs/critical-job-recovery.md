# Critical job crash recovery

YARK persists destructive or expensive work in two app-setting queues:

- `criticalJobsQueue.v1`: install files, update, and verify files.
- `backupCriticalJobsQueue.v1`: pre-update backup and restore.

The versioned keys remain compatible with older queue rows. On load, YARK adds
the durable phase, idempotency key, recovery reason, and operator-action state.
Active locks remain process-local and are never restored after a crash.

## Durable state

Each queued job stores its stable ID, operation/server identity, phase, status,
attempts, original creation time, last error, and recovery reason. Restore jobs
include the backup ID in their idempotency key. A duplicate operation cannot be
queued while an earlier copy is pending, running, retrying, blocked, failed, or
cancelled; terminal records must be retried or dismissed explicitly.

Statuses are `pending`, `running`, `retrying`, `paused`, `blocked`, `failed`, and
`cancelled`. Successful jobs are removed. Blocked, failed, and cancelled jobs
remain visible on the **Downloads** page until the operator acts.

## Restart contract

| Operation / interrupted phase | Recovery |
| --- | --- |
| Install or verify while applying SteamCMD/cache files | Replay from the top; SteamCMD validation and cache sync are idempotent |
| Install, update, or verify after the `files-applied` checkpoint | Reconcile as complete when runtime already matches; otherwise perform only the remaining restart transition |
| Install or verify while stopping/restarting ASA | Block; process state may be ambiguous |
| Update during validation | Replay; no material side effect has started |
| Update during stop, backup, file application without completion evidence, restart, or rollback | Block; the outcome needs operator review |
| Update after `rollback-complete` | Keep as failed with completed rollback evidence and allow an explicit retry |
| Pre-update backup after execution began | Reconcile backup rows/ZIPs, reuse completed kind checkpoints marked with the job ID, and continue with the next missing kind |
| Restore before application | Reuse its restore-history row and marked safeguard backup, then continue |
| Restore while applying | Block; never apply the restore again automatically |
| Restore with completed durable history | Reconcile as completed and remove the stale queue row |
| Any queued/retrying job not yet in an ambiguous phase | Resume with attempts and creation time preserved **when steamcmd.exe is on disk**. Pending file jobs start (Active) like Steam resuming interrupted downloads. Auto-start skips those servers so it cannot beat the files job and block an Update. |
| SteamCMD not installed | Pending file jobs block with Retry (waiters fail closed). Retry/Resume/new Install-Update-Verify refuse until SteamCMD is installed |
| Missing server/profile | Fail without retry |
| Corrupt or unsupported queue data | Copy the raw value to a timestamped `.quarantine.*` setting and reset the active queue |

The UI shows the server operation, current phase, attempts, last error/recovery
reason, and only actions supported by the state:

- `Retry` and `Dismiss` for ambiguous or exhausted-transient jobs.
- `Dismiss` only for non-retryable failed jobs, including a missing profile.
- `Cancel` for pending/retrying jobs.
- `Retry` and `Dismiss` for cancelled jobs. Retry re-queues the same operation (Install/Update/Verify also replace a cancelled leftover of that type).

Retry is an explicit acknowledgement for an ambiguous update or restore. Before
using it, inspect the server process, update logs, managed backup rows/ZIPs, and
restore history. Dismiss removes only the queue record; it does not delete
installations, backups, logs, or restore evidence.

Cancelling queued work makes it terminal immediately. Cancelling active work
first stops SteamCMD and signals backup critical jobs to stop between kinds /
packaging steps (except during `applying-restore`). If SteamCMD never changed
game files, update cancel skips rollback restore and only restores runtime
(restart when the server was running). When files may have changed, cancel still
completes any required rollback/runtime unwind; the job does not become terminal
while destructive recovery is still in progress. If that unwind is interrupted,
it remains blocked with Retry/Dismiss.

For updates, Retry preserves the interrupted recovery route: `restarting-server`
continues only start/health checks, incomplete `rollback-*` phases finish the
rollback, and only an update with a completed rollback or reusable pre-update
backup checkpoint returns to SteamCMD. Validation checkpoints do not erase the
persisted backup identity used by that decision.

Each new SteamCMD attempt clears the prior attempt's restored-backup markers, so
a later interrupted rollback cannot mistake older restore work for current
work. When update rollback recovery encounters its matching retryable blocked or
failed restore job in the backup queue, the parent Retry adopts that child job as
the same explicit operator confirmation and waits for it instead of requiring a
second Retry. Recovered restart and rollback completion hold the server instance
lock for the full runtime or restore transition, just like the normal update
path, so operator lifecycle actions cannot overlap them.

## Retry policy

Automatic retries are bounded to three attempts with a five-second delay.
Missing resources, invalid/unsafe input, permission failures, cancellation, and
unknown failures do not retry automatically. Only allow-listed transient
network/system failures retry. Attempts, the last error, and recovery reason
survive an application restart.

## Phase checkpoints

Update/install/verify checkpoints cover validation, process stop, pre-update
backup, file application, restart, and rollback. Backup jobs checkpoint backup
creation, restore history/safeguard creation, and restore application. A
checkpoint is persisted before and, where durable evidence exists, after each
material side effect. Startup recovery can therefore distinguish replay-safe,
reconciled, and ambiguous work instead of changing every `running` row back to
`pending`.

Duplicate durable rows are quarantined and coalesced into one blocked job at the
most conservative recovered phase. They are never replayed automatically based
on JSON order or a freshly generated migration timestamp.

## Verification

Run restart-boundary tests and the isolated Electron E2E flow with:

```powershell
npx vitest run tests/unit/critical-job-restart-integration.test.ts tests/unit/critical-job-recovery.test.ts
npm run build
npm run e2e:critical-job-recovery
```

The E2E suite creates a disposable Electron profile under
`C:\asa-e2e\profiles` and an empty server fixture under `C:\asa-e2e\servers`.
It seeds interrupted update, restore, cancelled, and missing-profile jobs,
restarts the actual app, verifies the recovery UI/actions, restarts again to
verify persistence, and deletes both fixtures only after success.
