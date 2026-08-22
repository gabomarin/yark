# React Compiler spike (#404)

**Date:** 2026-08-22  
**Branch tooling:** opt-in only (`YARK_REACT_COMPILER=1`)  
**Recommendation:** **Postpone** default enablement on `main`.

## Goal

Confirm Electron + Vite (`electron-vite` + `@vitejs/plugin-react` 4.x) can run
[`babel-plugin-react-compiler`](https://react.dev/learn/react-compiler) on the
**renderer** only, measure cost, and decide adopt / postpone / reject.

## What we wired

| Piece | Detail |
| --- | --- |
| Dependency | `babel-plugin-react-compiler@1.0.0` (dev) |
| Config | `electron.vite.config.ts` → renderer `@vitejs/plugin-react` `babel.plugins` when env is set |
| Target | `{ target: "19" }` (matches app React 19.2.x) |
| Scripts | `npm run build:compiler` / `npm run dev:compiler` (`scripts/with-react-compiler.cjs`) |
| Verbose log | `YARK_REACT_COMPILER_VERBOSE=1` prints CompileSuccess / CompileError lines |

Default `npm run build` / `npm run dev` stay **off** (no compiler).

Vitest (`vitest.config.ts`) does **not** enable the compiler; unit tests exercise
source as today.

## Compatibility result

**Works:** production `electron-vite build` with the compiler completes; typecheck
and renderer Vitest (333) still pass with the wiring present.

**Bail-outs are common.** One verbose build (2026-08-22, this machine):

| Event | Count |
| --- | --- |
| `CompileSuccess` | 165 |
| `CompileError` (skip optimize) | 74 |

Top skip reasons:

| Count | Reason |
| --- | --- |
| 42 | `TryStatement without a catch clause` (`try` / `finally` without `catch`) |
| 19 | ESLint react-hooks rule disabled in that file/region |
| 11 | `TryStatement` with a `finally` clause |
| 1 | Cannot access refs during render |
| 1 | Value blocks inside try/catch |

`App.tsx` and other large orchestration surfaces hit try/finally skips repeatedly.
That overlaps React Doctor noise (`no-adjust-state-on-prop-change`, giant
components) and [#146](https://github.com/gabomarin/yark/issues/146): the places
we most want free memoization are often the ones the compiler refuses.

Leave-guard callbacks (`confirmLeaveIfDirty(() => set…)`) are **not** a
compiler failure mode by themselves; they remain false positives for React
Doctor’s impure-updater rule ([react-doctor.md](react-doctor.md)).

## Cost (local Windows, indicative)

Same machine, cold-ish consecutive builds (variance ± a few seconds):

| Mode | Approx. `electron-vite` wall time | Renderer JS asset |
| --- | --- | --- |
| Baseline | ~9–12 s | ~3.71 MB |
| Compiler on | ~15–18 s | ~3.89 MB (~+180 KB) |

Expect slower CI `build` jobs if the compiler is always on. No reliable FPS /
Overview scroll deltas were collected in this spike (would need a scripted
Playwright / DevTools profile with a seeded large fleet).

## Product impact today

Existing Overview fan-out already uses intentional memo / `handlersRef` patterns
([design-system.md](design-system.md) React Compiler row). Turning the compiler
on **by default** would:

- Slow every pack/dev transform
- Grow the renderer bundle modestly
- Still **skip** many of the heaviest files until try/finally and
  eslint-disable hotspots are cleaned or the compiler gains support

So the operator-visible win is speculative until hot paths actually compile.

## Recommendation

**Postpone** enabling React Compiler by default.

Keep the opt-in path for experiments (`npm run build:compiler`,
`YARK_REACT_COMPILER=1`). Revisit when:

1. [#146](https://github.com/gabomarin/yark/issues/146) splits giant pages so more
   leaves are compiler-friendly, and/or  
2. Compiler support for `try`/`finally` improves, and/or  
3. A measured Overview / Mods Discover / Downloads scroll profile shows a clear
   win on a compiler-on build.

Reject is **not** justified: the toolchain works; the product timing is early.

When adopting later: enable the compiler ESLint recommended set (see
`eslint.config.mjs` comment), decide whether Vitest should share the same Babel
plugin, and remove the env gate only after a merge checklist with before/after
metrics.

## How to re-run

```bash
npm run build
npm run build:compiler
# Optional: count skips
set YARK_REACT_COMPILER_VERBOSE=1   # Windows PowerShell: $env:YARK_REACT_COMPILER_VERBOSE=1
npm run build:compiler
```
