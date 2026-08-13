# AGENTS.md

## Project language

**English** is the language of record for this repository. Agents must write GitHub
issues/PRs, commit messages, docs, code comments, and UI copy in English. Chat with
the user may follow the user's language; repo and GitHub artifacts stay English.
See `.cursor/rules/english-project-language.mdc`.

## Private planning

Unreleased product specs, design identity, and private tickets are canonical in
the private Notion Product Lab when Notion MCP is available. The hub URL lives
only in gitignored `.cursor/project-context/README.md`, which also keeps full
offline snapshots for agents without Notion. Do not recreate those specs as
tracked Markdown or link the hub from the public repository.

## Changelog

Update `CHANGELOG.md` under `## [Unreleased]` on feature branches (one short
operator-facing bullet). CI fails PRs that leave that section unchanged unless
the PR has the `skip-changelog` label. Details: [`.cursor/rules/changelog.mdc`](.cursor/rules/changelog.mdc),
[docs/versioning.md](docs/versioning.md).

## Security policy

Root [`SECURITY.md`](SECURITY.md) is the vulnerability-reporting policy. Keep it
aligned when trust boundaries change (IPC, wipe/import paths, credentials,
installer signing, Electron fuses). Sync operator copy in
`website/src/content/docs/docs/security-privacy.mdx` and the README Security
section when those stories change. Details:
[`.cursor/rules/security-policy.mdc`](.cursor/rules/security-policy.mdc).

## Pull request merges

**Squash merge** is the default when merging PRs into `main`.

- Prefer one commit on `main` per PR; use the PR title (English) as the squash commit
  subject.
- Use a merge commit only when intentionally preserving multiple commits on `main`
  (rare).
- Rebase merge is allowed for a linear history when squash is unsuitable, but is not
  the default.

## Cursor Cloud specific instructions

YARK server manager is a single Electron + React + TypeScript desktop app (no separate
backend service; persistence is embedded SQLite via Node's built-in `node:sqlite`).
Standard commands live in `package.json`, `README.md`, and `docs/agent-context.md`.
Vulnerability reporting: [SECURITY.md](SECURITY.md)
([`.cursor/rules/security-policy.mdc`](.cursor/rules/security-policy.mdc)).
Domain runbooks: [docs/backups.md](docs/backups.md), [docs/updates-steamcmd.md](docs/updates-steamcmd.md),
[docs/logs.md](docs/logs.md), [docs/server-lifecycle.md](docs/server-lifecycle.md),
[docs/rcon.md](docs/rcon.md), [docs/settings.md](docs/settings.md),
[docs/profile-database.md](docs/profile-database.md),
[docs/clusters.md](docs/clusters.md), [docs/mods.md](docs/mods.md),
[docs/website.md](docs/website.md), [docs/config-transfer.md](docs/config-transfer.md),
[docs/github-actions.md](docs/github-actions.md),
[docs/curseforge-proxy.md](docs/curseforge-proxy.md). UI composition for agents:
[docs/component-structure.md](docs/component-structure.md),
[docs/design-system.md](docs/design-system.md), [docs/datatable.md](docs/datatable.md).
Visual/e2e helpers: [docs/visual-testing.md](docs/visual-testing.md).

## Prefer Mantine (renderer UI)

When building or changing React UI, **use Mantine components and props wherever
they fit** before inventing custom chrome (steppers, tooltips, tabs, form
controls, alerts, modals, layout primitives). Theme/tokens live under
`src/renderer/src/shared/theme/`; recipe detail and exceptions are in
[docs/design-system.md](docs/design-system.md). Cursor rule:
[`.cursor/rules/prefer-mantine.mdc`](.cursor/rules/prefer-mantine.mdc).

Examples already in the app: `CreateClusterModal` / `AddServersModal` use
Mantine `Stepper`; INI/cluster apply flows use `Modal`, `Checkbox`, `Alert`,
`Tooltip`. Shared YARK atoms (`AppSurfaceCard`, `EmptyState`, `PathField`, …)
still take precedence when the design system defines that surface.

Notes specific to running this in the Linux cloud VM:

- Dependencies are refreshed automatically by the startup update script (`npm install`).
  Node 22.12+ is required (`node:sqlite` and the current Electron toolchain) and available.
- Lint/test/build/run all work on Linux. There is no ESLint config yet; `npm run typecheck`
  (`tsc --noEmit`) is the TypeScript gate and `npm run lint` enforces the feature-file
  size policy in [docs/component-structure.md](docs/component-structure.md) (placeholder
  for a fuller linter later). `npm run build` is clean.
 GitHub Actions **CI** (`.github/workflows/ci.yml`) runs typecheck + lint + tests + build
 on `windows-latest` for every PR and push to `main` (avoids known Linux path-test gaps),
 then Electron E2E smoke / CRUD / install-health / host-port-probe (#12). Matrix:
 [docs/e2e-validation.md](docs/e2e-validation.md).
  PRs also run **Changelog** (`.github/workflows/changelog.yml`): `CHANGELOG.md` must change
  unless the PR is labeled `skip-changelog`.
  Local Husky hooks (after `npm install`): pre-commit runs typecheck + lint; pre-push runs
  typecheck + test + lint. On WSL with a Windows checkout (`/mnt/...`), hooks delegate to
  `cmd.exe` so win32 `node_modules` (Rollup) work. Skip only with `--no-verify` / `HUSKY=0`
  in emergencies — CI still gates merges.
- Running the app: `npm run dev` (dev, HMR) or `npm start` (preview a build). It opens a
  real Electron window on the VM desktop display, so it must run through the GUI/desktop
  environment (e.g. computer use), not as a plain headless process.
- If `ELECTRON_RUN_AS_NODE=1` is set in the environment, Electron will not open its window.
  `unset ELECTRON_RUN_AS_NODE` before `npm run dev` / `npm start`. Packaged visual helpers
  and the `e2e:*` scripts (via `scripts/e2e-launch.cjs`) clear the variable themselves.
- On the headless Linux desktop, Electron prints benign `dbus/bus.cc ... Failed to connect
  to the bus` and `viz_main_impl.cc ... Exiting GPU process` errors on launch. These are
  harmless; the window still renders and the app is fully usable.
- `npm test` (vitest): ~235 pass. 8 tests fail on Linux because they assert Windows path
  semantics (e.g. `C:\tools\steamcmd`, "resolves Windows drive roots") that Node's POSIX
  `path` module cannot reproduce off Windows. This is a platform limitation, not a
  regression; these pass on Windows / via `cmd.exe /c` per the README.
- `npm run e2e:smoke` / `npm run e2e` launch the compiled app via Playwright's
  `_electron` and need a display. They use isolated `YARK_E2E_USER_DATA` and assert
  `[data-overview-page]` / `[data-server-card]` (see [docs/e2e-validation.md](docs/e2e-validation.md)).
- Creating a server requires a Windows-style absolute install path (e.g. `C:\ARK`) and an
  admin password of at least 4 chars, and each server needs unique game/query/RCON ports.
  Launch / spawn / profile→INI details: `docs/server-lifecycle.md`.
- Real SteamCMD install/sync (`steamcmd:install`, robocopy) is Windows-oriented; do not
  expect end-to-end ASA file installs to succeed on the Linux agent. UI and unit tests are
  still useful here — see [docs/updates-steamcmd.md](docs/updates-steamcmd.md).
