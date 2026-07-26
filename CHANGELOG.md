# Changelog

All notable changes to **YARK server manager** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

How to bump versions and cut releases: see [docs/versioning.md](docs/versioning.md).

## [Unreleased]

### Added

- Engineering runbooks for SteamCMD/safe-update auto-stop and operational logs (`docs/updates-steamcmd.md`, `docs/logs.md`).
- Shared shell atmosphere (soft gradient + topography SVG) across sidebar and main content.
- Official ARK network version from Wildcard CDN for sidebar and SteamCMD chrome.
- Local Cursor project context for backlog (`.cursor/project-context/`, gitignored).
- Functional **Backups** page (list / create / restore / schedule + retention) with IPC over existing backup services.
- Per-server backup destination (default `{installDir}\\Backups`) plus open destination / open backup folder actions.

### Changed

- Product branding renamed to **YARK server manager**.
- Repository user-facing strings and docs moved to English.
- Mods managed from the Server tab (comma-separated CurseForge Project IDs); dedicated Mods tab deferred pending API key.
- Server start spawns `ArkAscendedServer.exe` directly (no `.cmd` / `cmd` wrapper), so lifecycle tracks the game process and spaced install paths no longer flash a visible CMD.

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
