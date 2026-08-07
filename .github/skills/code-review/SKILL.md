# YARK — Copilot code review instructions

You review PRs for **YARK**: Electron + React + TypeScript ASA server manager (SQLite via `node:sqlite`). Primary OS: Windows. CI: `windows-latest`.

## Philosophy

- Comment only with **high confidence (>80%)** that a real defect exists.
- **Priority order:** security & safety > correctness > architecture. Skip lower tiers if higher ones already fill the budget.
- **Budget:** at most **~8 comments** per PR. Prefer fewer. One issue per comment.
- Be concise and actionable. No taste, no optional refactors, no “consider later.”
- On prose (UI/docs/changelog): comment only if text is confusing or error-prone. Repo artifacts are **English**.
- **Docs/chore-only PRs:** almost never comment unless security, broken links/commands, or clearly wrong operator guidance.
- If unsure, **do not comment**.

## Stack (do not invent another)

Main `src/main` · preload `src/preload` · renderer `src/renderer` (React + Mantine) · shared `src/shared` · backend `src/backend`.  
IPC must stay triple-synced: `src/shared/ipc.ts` ↔ `src/preload/index.ts` ↔ `src/main/ipc-handlers.ts`.

## Hot paths (scrutinize diffs here)

1. `src/main/ipc-handlers.ts`, `src/preload/index.ts`, `src/shared/ipc.ts` — new/changed IPC surface
2. `src/backend/domains/instances/launch-args.ts`, `src/shared/launch-map-url.ts`, `src/backend/infra/process/process-manager.ts` — spawn, argv, map URL quoting, no secrets on ASA CLI
3. `src/backend/domains/updates/update-service.ts` — SteamCMD spawn, install/update paths
4. `src/backend/domains/backups/` — archive/restore/wipe/delete of install or save data
5. RCON / console flows under backend + renderer workspace — credentials, command injection, session leaks

## What to flag

**Security:** secrets in logs/IPC/UI/tests/argv; path traversal or unsafe wipe/move; unsanitized `spawn`/`exec`; new IPC without validation; hardcoded secrets or machine paths; errors that leak secrets.

**Correctness:** logic bugs; missing `await` / unhandled rejections; races bypassing job/profile locks; process/RCON/file/timer leaks; Windows path breaks; launch-arg regressions (`extraArgs` vs structured, `ServerPlatform`, YARK-owned stems); bad defaults (optional bools that should be `false`); brittle tests asserting exact `data-*` strings when presence/role is the contract.

**Architecture:** breaks existing patterns; custom chrome where Mantine/shared atoms fit; feature files clearly over size policy without a split; broken e2e `data-*` contracts; ignores domain docs for the touched area (`docs/server-lifecycle.md`, `updates-steamcmd.md`, `backups.md`, `rcon.md`, `clusters.md`, `config-transfer.md`).

## Do not flag (CI / noise)

CI (`.github/workflows/ci.yml`) already runs `npm ci` → `typecheck` → `lint` (feature file size, not ESLint) → `test` → `build`. Changelog workflow requires Unreleased change unless `skip-changelog`.

Do **not** comment on: pure `tsc` errors; size-lint failures; tests/build CI will fail; missing local `npm install`/`npx`; formatting; Linux-only path semantics (Windows-primary); “file unchanged” changelog when Changelog CI is enough; speculative nits.

**Still review:** security, logic with weak/missing tests, IPC/Mantine drift, domain regressions, wrong changelog *content*, misleading copy that still typechecks.

## Response format

1. Problem (1 sentence)  
2. Why it matters (1 sentence, only if needed)  
3. Suggested fix (snippet or concrete action)

### Examples

This can put the admin password on the ASA process argv. Persist via profile→INI only; omit from launch args.

`installDir` is embedded in a shell string without the usual quoting/spawn helpers. Use existing spawn / `windowsVerbatimArguments` handling.

New IPC deletes filesystem paths without the wipe/move guards. Reuse shared path validation.

This asserts `data-active="true"`; the contract is attribute presence. Assert presence (or role/`aria-current`) to avoid Mantine/React flakes.

IPC added in main/preload but missing from `src/shared/ipc.ts`. Keep the triple in sync.
