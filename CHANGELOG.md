# Changelog

All notable changes to **YARK server manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

How to bump versions and cut releases: see [docs/versioning.md](docs/versioning.md).

## [Unreleased]

### Added

- Shared shell atmosphere (soft gradient + topography SVG) across sidebar and main content.
- Official ARK network version from Wildcard CDN for sidebar and SteamCMD chrome.
- Local Cursor project context for backlog (`.cursor/project-context/`, gitignored).
- Functional **Backups** page (list / create / restore / schedule + retention) with IPC over existing backup services.
- Per-server backup destination (default `{installDir}\\Backups`) plus open destination / open backup folder actions.
- Kind-scoped ZIP backups (`World/` / `Player profiles/` / `INI/`), disk↔SQLite reconcile, fleet health, disk alerts, and cleanup preview/run.
- Structured operational event `details` (What / Cause / Where / Try next) with clear/export support and workspace Logs deep-links (`logsFocus`).
- Engineering runbooks: [docs/backups.md](docs/backups.md), [docs/updates-steamcmd.md](docs/updates-steamcmd.md), [docs/logs.md](docs/logs.md), [docs/server-lifecycle.md](docs/server-lifecycle.md), [docs/website.md](docs/website.md).
- Project site feature screenshot gallery under `website/screenshots/` with an engineering runbook in `docs/website.md`.
- GitHub Actions Windows release workflow (tag `v*` → NSIS installer on the GitHub Release).

### Changed

- Project license set to **GPL-3.0-only** (was undeclared MIT in `package.json` only).
- Product branding renamed to **YARK server manager**.
- Repository user-facing strings and docs moved to English.
- Mods managed from the Server tab (comma-separated CurseForge Project IDs); dedicated Mods tab deferred pending API key.
- Server start spawns `ArkAscendedServer.exe` directly (no `.cmd` / `cmd` wrapper), so lifecycle tracks the game process and spaced install paths no longer flash a visible CMD.
- Safe **Update** / **Verify** auto-stop the server when needed (stop → pre-update backup → SteamCMD → conditional restart/rollback) instead of requiring a manual stop first.

### Removed

- Tracked in-repo TODO / historical planning docs (moved to local agent context).

## [0.1.0] - 2026-07-24

### Added

- Initial public preview of YARK server manager (Electron + React + TypeScript).
- Multi-server profiles with start / stop / restart / force-stop.
- SteamCMD install, update, and verify flows.
- Backups, operational logs, and cluster compliance checks.
- Server Workspace with INI editor and on-demand configuration assistant.
- Overview, SteamCMD, and Logs pages in the new renderer shell.

[Unreleased]: #unreleased
[0.1.0]: #010---2026-07-24
