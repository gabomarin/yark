# AGENTS.md

## Project language

**English** is the language of record for this repository. Agents must write GitHub
issues/PRs, commit messages, docs, code comments, and UI copy in English. Chat with
the user may follow the user's language; repo and GitHub artifacts stay English.
See `.cursor/rules/english-project-language.mdc`.

## Pull request merges

**Squash merge** is the default when merging PRs into `main`.

- Prefer one commit on `main` per PR; use the PR title (English) as the squash commit
  subject.
- Use a merge commit only when intentionally preserving multiple commits on `main`
  (rare).
- Rebase merge is allowed for a linear history when squash is unsuitable, but is not
  the default.

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
Domain runbooks: [docs/backups.md](docs/backups.md), [docs/updates-steamcmd.md](docs/updates-steamcmd.md),
[docs/logs.md](docs/logs.md), [docs/server-lifecycle.md](docs/server-lifecycle.md),
[docs/website.md](docs/website.md). UI composition for agents:
[docs/component-structure.md](docs/component-structure.md),
[docs/design-system.md](docs/design-system.md). Visual/e2e helpers:
[docs/visual-testing.md](docs/visual-testing.md).

Notes specific to running this in the Linux cloud VM:

- Dependencies are refreshed automatically by the startup update script (`npm install`).
  Node 22.12+ is required (`node:sqlite` and the current Electron toolchain) and available.
- Lint/test/build/run all work on Linux. There is no ESLint config yet; `npm run typecheck`
  (`tsc --noEmit`) is the TypeScript gate and `npm run lint` enforces the feature-file
  size policy in [docs/component-structure.md](docs/component-structure.md) (placeholder
  for a fuller linter later). `npm run build` is clean.
  GitHub Actions **CI** (`.github/workflows/ci.yml`) runs typecheck + lint + tests + build
  on `windows-latest` for every PR and push to `main` (avoids known Linux path-test gaps).
  Local Husky hooks (after `npm install`): pre-commit runs typecheck + lint; pre-push runs
  typecheck + test + lint. On WSL with a Windows checkout (`/mnt/...`), hooks delegate to
  `cmd.exe` so win32 `node_modules` (Rollup) work. Skip only with `--no-verify` / `HUSKY=0`
  in emergencies — CI still gates merges.
- Running the app: `npm run dev` (dev, HMR) or `npm start` (preview a build). It opens a
  real Electron window on the VM desktop display, so it must run through the GUI/desktop
  environment (e.g. computer use), not as a plain headless process.
- If `ELECTRON_RUN_AS_NODE=1` is set in the environment, Electron will not open its window.
  `unset ELECTRON_RUN_AS_NODE` before `npm run dev` / `npm start` / the e2e scripts.
  Packaged visual helpers clear the variable themselves; `e2e:smoke` / `e2e` currently do
  **not** — unset it in the shell first.
- On the headless Linux desktop, Electron prints benign `dbus/bus.cc ... Failed to connect
  to the bus` and `viz_main_impl.cc ... Exiting GPU process` errors on launch. These are
  harmless; the window still renders and the app is fully usable.
- `npm test` (vitest): ~235 pass. 8 tests fail on Linux because they assert Windows path
  semantics (e.g. `C:\tools\steamcmd`, "resolves Windows drive roots") that Node's POSIX
  `path` module cannot reproduce off Windows. This is a platform limitation, not a
  regression; these pass on Windows / via `cmd.exe /c` per the README.
- `npm run e2e:smoke` / `npm run e2e` launch the compiled app via Playwright's
  `_electron` and need a display + `ELECTRON_RUN_AS_NODE` unset. The app launches fine;
  note the smoke script may still fail on a stale `section.servers h2` selector (the suite
  uses `[data-server-card]` instead).
- Creating a server requires a Windows-style absolute install path (e.g. `C:\ARK`) and an
  admin password of at least 4 chars, and each server needs unique game/query/RCON ports.
  Launch / spawn / profile→INI details: `docs/server-lifecycle.md`.
- Real SteamCMD install/sync (`steamcmd:install`, robocopy) is Windows-oriented; do not
  expect end-to-end ASA file installs to succeed on the Linux agent. UI and unit tests are
  still useful here — see [docs/updates-steamcmd.md](docs/updates-steamcmd.md).
