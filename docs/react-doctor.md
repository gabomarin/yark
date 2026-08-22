# React Doctor

YARK uses [React Doctor](https://react.doctor) as an optional renderer/backend
hygiene scanner (`npx react-doctor@latest`). It is **not** a merge gate.

## Baseline (2026-08-21)

| Metric | Value |
| --- | --- |
| Score | **64** (Needs work) before `doctor.config.json` noise rules were turned off; **~69** after config (warnings drop; not a merge gate) |
| Share | https://react.doctor/share?p=yark-server-manager&s=64&e=2&w=163&f=66 (pre-config); post-config ~https://react.doctor/share?p=yark-server-manager&s=69&w=76&f=49 |
| Config | Root [`doctor.config.json`](../doctor.config.json) (#403) |

Re-run after config:

```bash
npx react-doctor@latest --verbose
npx react-doctor@latest design --verbose
```

On renderer PRs, agents may run `npx react-doctor@latest --verbose --scope changed`
and avoid regressing newly introduced **errors**. Do not mass-fix warnings.

## Rules turned off (intentional)

| Rule | Why |
| --- | --- |
| `no-impure-state-updater` | False positives on leave-guard callbacks (`confirmLeaveIfDirty(() => set…)`) — not React state updaters. Spot-checked `ServerWorkspacePage`. |
| `no-adjust-state-on-prop-change` | Dialogs/wizards reset local state when `opened` / server id changes — product pattern. |
| `async-await-in-loop` | SteamCMD / backup / install work is often **intentionally sequential**. Do not blind-`Promise.all`. |
| `no-loading-flag-reset-outside-finally` | Sites already clear busy flags in `finally` with generation guards; scanner misreads conditional clears. |
| `prefer-html-dialog` | Electron overlays (`AppBusyOverlay`) are intentional, not `<dialog>`. |

Giant components (`no-giant-component`) stay **on** — tracked by [#146](https://github.com/gabomarin/yark/issues/146) and `scripts/component-structure-baseline.json`.

## Remaining intentional exceptions (design scan)

After #402 / #403 (2026-08-21):

| Finding | Stance |
| --- | --- |
| Website `faq.astro` / `index.astro` em dashes | Out of scope for app tickets; optional follow-up |
| Move install success | **Close** |
| Settings setup-assistant last step | **Finish** (distinct from dismiss **Close**) |
| Stepper **Continue** / **Back** (`design-no-vague-button-label`) | Keep when the step title already states the action ([design-system.md](design-system.md#operator-facing-copy)) |

## Related

- Operator copy design nits: [#402](https://github.com/gabomarin/yark/issues/402)
- React Compiler spike: [#404](https://github.com/gabomarin/yark/issues/404)
