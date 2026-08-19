# Windows E2E and real-host validation (#12)

How YARK splits **automated PR gates** (Electron UI / diagnostics on
`windows-latest`) from **prepared-host / manual release** evidence (real ASA
binaries, SteamCMD, backups, rollback).

## Matrix

| Scenario | Command | Gate | Notes |
| --- | --- | --- | --- |
| Electron launch + sidebar | `npm run build && npm run e2e:smoke` | **PR CI** | Isolated `YARK_E2E_USER_DATA`; clears `ELECTRON_RUN_AS_NODE` |
| Create / clone / delete UI | `npm run build && npm run e2e` | **PR CI** | Disposable dirs under `C:\asa-e2e\…` |
| Install-health badges | `npm run build && npm run e2e:install-health` | **PR CI** | Fake FS fixtures only |
| Host port probe modal | `npm run build && npm run e2e:host-port-probe` | **PR CI** | Occupies UDP then asserts modal |
| Clone INI seed / folder copy | `npm run build && npm run e2e:clone-copy` | Local / release audit | Fake ASA tree; profile-only vs robocopy (#160); always deletes fixtures |
| Clone after real SteamCMD install | `npm run build && npm run e2e:clone-copy-real` | **Manual real-host** | Installs ASA into `C:\asa-e2e`, then config-only + full-folder clone (#160); deletes fixtures unless `YARK_E2E_KEEP=1` |
| Import install wizard | `npm run build && npm run e2e:import-install` | Local / release audit | Nested / ready / Already managed; profile-only INI (#254) |
| Move install | `npm run build && npm run e2e:move-install` | Local / release audit | Same-volume rename |
| Launch args on Runtime | `npm run build && npm run e2e:launch-args` | Local / release audit | Fake ready install |
| RCON console (mock) | `npm run build && npm run e2e:rcon` | Local / release audit | `YARK_E2E_RCON_MOCK=1` |
| Safe-update A–F | `node scripts/validation/validate-safe-update.cjs --confirm` | **Manual real-host** | See [updates-steamcmd.md](updates-steamcmd.md#real-host-validation-windows); evidence linked from #12 / #14 |
| Start → RCON ready → stop/restart on real ASA | Operator runbook (below) | **Manual real-host** | Not downloaded in CI |
| Backup restore (test-owned) | Operator Backups UI + disposable profile | **Manual real-host** | Never operator production worlds |
| Cluster survivor / item / dino transfers | Operator client + two YARK servers | **Manual real-host** | [spikes/22-cluster-live-transfers.md](spikes/22-cluster-live-transfers.md) (#22) |
| ProcessManager real spawn | `npm test -- tests/integration/process-manager-real-start.test.ts` | Unit/integration (Windows) | Fake `ArkAscendedServer.exe` via `PING.EXE`; cleanup retries `EBUSY` |

## PR CI contract

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) on
`windows-latest`.

1. Typecheck, lint, unit/integration tests, build (existing).
2. Then Electron E2E: smoke → CRUD suite → install-health → host-port-probe.

Requirements:

- Built `out/` tree before any `e2e:*` script.
- Isolated app data (`YARK_E2E_USER_DATA`); never the developer’s real AppData.
  The same env skips the startup splash and the first-run setup wizard so
  `waitForOverview` hits the main window without a modal overlay.
- Settings uses a **category sidebar** (General, Servers, SteamCMD, Logs, About).
  Click the in-page `Settings categories` nav — not the shell Servers/Logs
  buttons, which share those labels. Helper: `openSettingsCategory` in
  [`scripts/e2e-launch.cjs`](../scripts/e2e-launch.cjs).
- Cleanup only fixture paths created by that run (`C:\asa-e2e\…` or tmp).
- Launch failures must mention Electron/display/`ELECTRON_RUN_AS_NODE`/missing
  build — not only a Playwright selector timeout. Shared helpers:
  [`scripts/e2e-launch.cjs`](../scripts/e2e-launch.cjs).
- Create/edit **Base folder** (and other PathFields) are browse-only chips
  (`aria-readonly`). Do not `.fill()` them — stub `dialog.showOpenDialog` and
  click **Browse** (`pickPathField` / `stubFolderPicker`).

Out of PR CI: SteamCMD depot download, real ASA process lifecycle, safe-update
rollback demos, and long move/import suites (keep local / release audit).

## UI changes and E2E

Playwright scripts in `scripts/e2e-*.cjs` click **visible copy**, **accessible
names**, **roles**, and **`data-*` selectors**. A renderer or shell change that
moves, renames, or overlays those controls will fail local suites even when
unit tests and PR CI stay green (CI only runs smoke, CRUD, install-health, and
host-port-probe).

When changing operator-facing UI (layout, nav, Settings, first-run wizard,
modals, workspace tabs, PathFields):

1. Search `scripts/e2e` (and `scripts/e2e-launch.cjs`) for the old label, role,
   or `data-*` you touched.
2. Update those scripts in the **same PR**. Prefer shared helpers
   (`openSettingsCategory`, `pickPathField`, `waitForOverview`,
   `YARK_E2E_USER_DATA`) over one-off selectors.
3. `npm run build`, then run **only the affected** `npm run e2e:*` commands on
   Windows. Skip `e2e:crash-reattach` / `e2e:clone-copy-real` unless the change
   is on that real-host path (they install ASA).
4. Keep `data-*` contracts stable unless you update every script that uses them.

| UI surface | Likely scripts |
| --- | --- |
| Shell nav, Overview, New server / Clone / Delete | `e2e:smoke`, `e2e` |
| Page titles without restating subtitles | `e2e:smoke`, `e2e`, `e2e:clusters-membership` |
| Settings category sidebar or labels | `e2e:launch-args`, `e2e:quit-policy`, `e2e:log-retention` |
| First-run setup wizard / splash | Any launch that must set `YARK_E2E_USER_DATA` |
| Workspace Mods | `e2e:mods` |
| Clone dialog / INI or folder copy | `e2e`, `e2e:clone-copy` |
| Import / move install | `e2e:import-install`, `e2e:move-install` |
| Launch / Runtime / console-on-start | `e2e:launch-args` |
| RCON console | `e2e:rcon` |
| Clusters membership | `e2e:clusters-membership` |
| Copy configuration | `e2e:copy-configuration` |
| Downloads queue / critical-job recovery | `e2e:critical-job-recovery`, `node scripts/visual-downloads.cjs` |
| Log retention (Settings → Logs) | `e2e:log-retention` |

Cursor rule: [`.cursor/rules/e2e-ui.mdc`](../.cursor/rules/e2e-ui.mdc).

## Real-host release runbook (summary)

1. Disposable ASA profile + unique ports; SteamCMD configured.
2. Safe-update scenarios A–F via
   [updates-steamcmd.md](updates-steamcmd.md#real-host-validation-windows).
3. Separately: Start until Overview shows RCON-ready **running**, SaveWorld /
   Stop / Restart (`servers:restart`), create + restore a **test-owned** backup.
4. Record date, commit, scenario pass/fail; **redact** passwords and player PII.
5. Link evidence on GitHub **#12** (and #14 for safe-update).

## EBUSY cleanup (integration)

Historical full-suite flakes on Windows when deleting a just-killed fake ASA
binary (`EBUSY` / `EPERM`) are mitigated by short retries in
`tests/integration/process-manager-real-start.test.ts` and
`scripts/e2e-launch.cjs` `removeFixtureDir`. If a flake returns, preserve the
fixture path printed by the failing script and check AV locks on
`C:\asa-e2e`.

## Related docs

- [visual-testing.md](visual-testing.md) — visual helpers vs E2E commands
- [updates-steamcmd.md](updates-steamcmd.md) — safe-update real-host checklist
- [server-lifecycle.md](server-lifecycle.md) — start / stop / restart
- [backups.md](backups.md) — restore requires `!isActive`
- [github-actions.md](github-actions.md) — CI workflow inventory
