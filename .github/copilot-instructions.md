# Copilot Instructions

## Source of truth
- Before continuing any work in this repository, review `TODO.md`.
- Use `TODO.md` as the primary reference for what is done, partial, and remaining.
- If you complete a task or change the real project status, update `TODO.md` in the same change.

## Work priority
- Unless the user sets another priority, continue from the `Recommended next priority` section in `TODO.md`.
- Do not reopen work already marked done unless the user asks for a fix, refactor, or expansion.
- When proposing the next step, align it with open items in `TODO.md`.

## Project rules
- Keep the current architecture: Electron + React + TypeScript + local SQLite (`node:sqlite`).
- Prefer small, verifiable changes focused on the root cause.
- Do not introduce unnecessary native dependencies if a pure Node/TypeScript alternative exists.
- For Windows paths, preserve compatibility with a real Windows environment.

## Verification
- If backend, shared, or critical flows change: run `npm test` and `npm run typecheck`.
- If renderer, preload, main, or app integration change: run `npm run build`.
- If main UI flows change: run `npm run e2e` when feasible.
- If there are visual renderer changes: follow `docs/visual-testing.md` and review with Playwright/Electron at `1280x720`, `1920x1080`, and `2560x1440`.
- In this repo, for reliable verification, prefer commands via `cmd.exe /c` when the WSL environment fails due to optional Rollup dependencies.

## Continuity
- If several options are reasonable, choose the one that closes the most real `TODO.md` items with the least risk.
- If you add new tests, try to keep them repeatable and automated.
- If you find relevant technical debt, record it in `TODO.md`.
