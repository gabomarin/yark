# Deep Code Review Remediation Plan

Date: 2026-07-24  
Status: Proposed  
Scope: Backend update/backup/log flows, renderer polling/log UX robustness, and test coverage hardening.

## 1. Goal

Convert the deep code review findings into an execution plan that is actionable, verifiable, and isolated from `TODO.md`.

Success means:

- Update operations report accurate outcomes (success vs rollback) with no false positives.
- Critical-job queue waiters are concurrency-safe under repeated user actions.
- Logs reading is scalable and bounded for large files.
- Renderer polling load is reduced while preserving responsive UX.
- Critical flows gain automated regression tests.

## 2. Findings to Address (Prioritized)

F1 (High): Update rollback path can resolve as successful after a failed update, producing misleading completion semantics.

F2 (High): `UpdateService` waiter handling for duplicate queued jobs can overwrite previous promise waiters.

F3 (Medium-High): Update log reading and metadata parsing load full files into memory, hurting scalability.

F4 (Medium): Renderer performs expensive global refresh polling at high frequency during SteamCMD busy windows.

F5 (Medium): IPC log-read path lacks strict backend-side bounds enforcement for `maxBytes`.

F6 (Medium): Missing targeted automated tests for queue/update/rollback/cancel/retry semantics.

F7 (Low-Medium): Logs page can show stale details due to async race when switching servers quickly.

F8 (Low): Historical docs can confuse current implementation status if not explicitly marked as historical.

## 3. Execution Strategy

Deliver in small, safe phases with tests in each phase.

### Phase 0: Baseline and Safety Net

- Capture baseline behavior for update success/failure/rollback event timeline.
- Add focused test scaffolding for `UpdateService` queue and completion semantics.
- Keep API compatibility where possible; only extend types/contracts when necessary.

Exit criteria:

- Repro steps documented for current F1/F2 behavior.
- New test files created with at least one failing test for each high-priority finding.

### Phase 1: Correct Update Completion Semantics (F1)

- Refactor update flow so rollback after failed update does not report plain success.
- Introduce explicit operation outcome model for update jobs:
  - `completed`
  - `completed_with_rollback`
  - `failed`
  - `cancelled`
- Ensure queue resolver and emitted events reflect the same final outcome.

Implementation targets:

- `src/backend/domains/updates/update-service.ts`
- `src/shared/types.ts` (only if new outcome type is exported)
- Renderer handling for update notifications/status if needed.

Exit criteria:

- Failed update + successful rollback is visible as rollback outcome, not plain success.
- UI and events show consistent status.
- Unit tests cover all four outcome states.

### Phase 2: Fix Waiter Concurrency in Update Queue (F2)

- Replace single waiter map entry with multi-waiter list pattern (as used in backup queue).
- Guarantee all callers awaiting the same job receive completion/rejection.
- Add cleanup assertions to prevent leaked waiters.

Implementation targets:

- `src/backend/domains/updates/update-service.ts`

Exit criteria:

- Concurrent duplicate requests for same queued job all resolve deterministically.
- No hanging promises in tests.

### Phase 3: Log Reading Scalability and Bounded I/O (F3, F5)

- Add strict backend clamp for `maxBytes` (for example `16_384` to `1_048_576`).
- Replace full-file read in update log viewer path with bounded tail-read.
- Parse status metadata (`exitCode`, `durationMs`) from header-only read instead of full file.
- Keep path safety checks as currently implemented.

Implementation targets:

- `src/backend/domains/logs/logs-service.ts`
- `src/main/ipc-handlers.ts` (validation/clamp)

Exit criteria:

- Large update logs do not require full-file memory load for listing or tail display.
- Measured read latency improves in synthetic large-log test.

### Phase 4: Polling Load Optimization (F4)

- Split refresh logic into channels:
  - Fast channel (SteamCMD status/console, runtime status) during busy periods.
  - Slow channel (installation info, cluster checks, recent events) at lower frequency.
- Avoid forcing expensive calls every 500 ms.
- Keep user-facing responsiveness for progress and server state transitions.

Implementation targets:

- `src/renderer/src/App.tsx`

Exit criteria:

- Busy-mode IPC call volume for heavy endpoints drops significantly.
- No regression in progress UX while operations are active.

### Phase 5: Logs Page Race Guard (F7)

- Add request token/version guard so out-of-order async responses are ignored.
- Ensure selected server and selected update file remain internally consistent after fast switching.

Implementation targets:

- `src/renderer/src/features/logs/LogsPage.tsx`

Exit criteria:

- Manual and automated checks confirm no stale log content after rapid server changes.

### Phase 6: Documentation Clarity (F8)

- Mark historical rewrite docs with a short “state evolved” note and pointer to current truth source.
- Avoid duplicating roadmap details in multiple places.

Implementation targets:

- `docs/superpowers/specs/2026-07-23-overview-frontend-rewrite-design.md`
- `docs/superpowers/plans/2026-07-23-overview-frontend-rewrite.md`

Exit criteria:

- Readers can quickly tell what is historical vs current state.

## 4. Verification Matrix

Run after each phase touching relevant layers:

- Backend/shared critical flows:
  - `cmd.exe /c "npm test"`
  - `cmd.exe /c "npm run typecheck"`
- Renderer/main/preload/integration changes:
  - `cmd.exe /c "npm run build"`
- UI behavior changes in active views:
  - Follow `docs/visual-testing.md`
  - Validate at `1280x720`, `1920x1080`, `2560x1440`

Suggested targeted tests to add:

- `tests/unit/update-service-queue.test.ts`
- `tests/unit/update-service-rollback-status.test.ts`
- `tests/unit/logs-service-tail-read.test.ts`
- `src/renderer/src/features/logs/LogsPage.test.tsx` (race switching scenario)

## 5. Risk Controls

- Keep changes incremental and phase-gated.
- Preserve IPC backward compatibility unless explicit frontend migration is included in same phase.
- Avoid broad refactors outside touched flows.
- For queue semantics changes, prefer explicit outcome typing over implicit string matching in UI.

## 6. Deliverables

- Code changes per phase with tests.
- Short phase notes (what changed, why, evidence).
- Final summary mapping each finding F1-F8 to implemented status.

## 7. Suggested Order of Execution

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6

This order minimizes user-facing risk first (correctness and concurrency), then addresses performance and UX consistency, and finally documentation hygiene.
