<p align="center">
  <img src="website/public/assets/yark-logo.png" width="180" alt="YARK server manager logo">
</p>

<h1 align="center">YARK server manager</h1>

<p align="center">
  A local Windows desktop application for installing, configuring, operating, and recovering
  ARK: Survival Ascended dedicated servers.
</p>

<p align="center">
  <a href="https://github.com/gabomarin/yark/actions/workflows/ci.yml">
    <img src="https://github.com/gabomarin/yark/actions/workflows/ci.yml/badge.svg" alt="CI status">
  </a>
  <a href="https://github.com/gabomarin/yark/releases">
    <img src="https://img.shields.io/github/v/release/gabomarin/yark?include_prereleases&label=release" alt="Latest release">
  </a>
  <a href="https://github.com/gabomarin/yark/releases">
    <img src="https://img.shields.io/github/downloads/gabomarin/yark/total" alt="Cumulative downloads">
  </a>
  <img src="https://img.shields.io/badge/status-prerelease-orange" alt="Prerelease">
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/gabomarin/yark" alt="GPL-3.0 license">
  </a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D4" alt="Windows">
</p>

<p align="center">
  <a href="https://getyark.com/">Website</a>
  ·
  <a href="https://getyark.com/docs/">Operator docs</a>
  ·
  <a href="https://github.com/gabomarin/yark/releases">Releases</a>
  ·
  <a href="https://github.com/gabomarin/yark/issues">Issues</a>
</p>

> [!WARNING]
> YARK is a public prerelease and is not production-ready. Current Windows installers are
> unsigned, so SmartScreen may warn. Download only from the official
> [GitHub Releases](https://github.com/gabomarin/yark/releases) page and follow the
> [download verification guide](https://getyark.com/docs/getting-started/#verify-your-download).

![YARK servers overview](website/public/screenshots/overview.png)

## Why YARK?

YARK started because I was tired of the tools I used to manage my ASA servers. They worked,
but I spent too much time fighting their configuration screens — and several features I wanted
sat behind paid tiers.

I wanted a Windows app that was easier to live with, ran on my own machine, and did not lock
the useful parts behind a paywall. At first it was just for my own servers. Once it became
useful enough, I released it as a free, open-source prerelease.

Running an ASA dedicated server normally means coordinating SteamCMD folders, launch arguments,
INI files, ports, backups, logs, mods, and Windows processes by hand. YARK brings those concerns
into one desktop shell while keeping server files and operational data on the host you control.

The application is built for operators managing one or more local Windows servers. It is not a
cloud hosting service, an ARK game launcher, or an official Studio Wildcard product.

## Capabilities

| Area | What YARK provides |
| --- | --- |
| Server profiles | Create, clone, enable, disable, and manage multiple servers with independent paths, maps, ports, access settings, mods, and cluster fields. **Import install** adopts an existing ASA folder (ready by default; incomplete with opt-in). Overview sort/view toggles and **Update All** queue safe fleet updates into Downloads. |
| Lifecycle | Start, stop, restart, and force-close exact managed processes; readiness waits for RCON instead of assuming a spawned process is healthy. **Remove from YARK only** keeps the install folder, or wipe everything on delete. |
| SteamCMD | Install, update, and verify ASA server files using a shared content cache; **Downloads** queues those jobs with Pause/Resume and a live console. |
| Safe maintenance | Coordinate stop, recovery backups, update/verify work, conditional restart, and rollback through locked backend operations. |
| Backups | Create, restore, export, and import world / INI archives; player join/leave archives; schedule world backups and inspect fleet health. |
| Configuration | Edit `GameUserSettings.ini` and `Game.ini` through visual and raw editors, with a guided configuration wizard. Launch tab search filters curated ASA flags. |
| Mods | Manage CurseForge Project IDs, metadata, enable/disable state, and launch-time `-mods=` composition without embedding the CurseForge API key. **Maps** packs: enable on Mods, then pick under Server Information → Map (Map mods / Custom…). |
| Diagnostics | Review events, runtime output, SteamCMD history, backup activity, installation health, host-port conflicts, and log retention. |
| Windows integration | System tray, close-to-tray, Start with Windows, Auto-start with YARK, in-app YARK updates, and Windows-aware process/file operations. |

## Screenshots

| Server configuration | Visual INI editor |
| --- | --- |
| ![Server configuration workspace](website/public/screenshots/workspace-server.png) | ![Visual INI editor](website/public/screenshots/workspace-ini.png) |
| Identity, Move installation, networking, Auto-start, and cluster. | Searchable settings with descriptions and visual controls. |

| CurseForge mods | Backup operations |
| --- | --- |
| ![CurseForge mods workspace](website/public/screenshots/workspace-mods.png) | ![Backup operations](website/public/screenshots/backups.png) |
| Per-server Project IDs, metadata, and enable/disable state. | Fleet health, destinations, schedules, and export/import across servers. |

| Downloads queue | Clusters |
| --- | --- |
| ![SteamCMD Downloads queue](website/public/screenshots/downloads.png) | ![Clusters page](website/public/screenshots/clusters.png) |
| Active, queued, and paused SteamCMD jobs with Pause/Resume. | Cluster membership, INI templates, and shared directory compliance. |

More screenshots are available on the [project website](https://getyark.com/#screenshots).

## Getting started

### For operators

You need:

- A supported Windows host for the YARK desktop application and ASA server binaries.
- Enough free disk space for SteamCMD downloads, the shared content cache, server installations,
  and backups.
- SteamCMD installed in a writable location, or a location YARK can use for installation and
  update operations.

Then:

1. Download the latest installer from [GitHub Releases](https://github.com/gabomarin/yark/releases).
2. Verify its SHA-256 digest using the
   [operator guide](https://getyark.com/docs/getting-started/#verify-your-download).
3. Open **Settings** and select the folder containing `steamcmd.exe`.
4. Create a server profile with an absolute install path, unique game/query/RCON ports, and an
   admin password.
5. Install the dedicated-server files, review installation health, and start the server.
6. Create a backup before experimenting with updates, restores, or configuration changes.

See [Getting started](https://getyark.com/docs/getting-started/) for the complete
operator walkthrough.

## Security and data boundaries

- Electron runs with context isolation, renderer sandboxing, no renderer Node integration, and an
  explicit preload bridge. Packaged Windows builds also flip Electron fuses (no `ELECTRON_RUN_AS_NODE`,
  no Node CLI inspect / `NODE_OPTIONS`, ASAR integrity + only-load-from-asar); see
  [docs/versioning.md](docs/versioning.md).
- Renderer navigation and new-window creation are denied; approved external CurseForge links pass
  through validated application handling.
- Profiles, settings, events, and backup metadata are stored locally in embedded SQLite. YARK has
  no user account or application cloud.
- Server/admin credentials currently exist in the local profile database and in ASA-required INI
  files. The database copy is not yet protected with Windows DPAPI; INI backups may also contain
  credentials.
- CurseForge metadata requests use a small Cloudflare Worker so the upstream API key is never
  embedded in the Electron application.
- Recursive install/backup/move/cache copies do not follow Windows directory junctions; destination
  trees that already contain links fail closed before writes
  ([#322](https://github.com/gabomarin/yark/issues/322)).
- Current installers are unsigned. Authenticode signing and RFC 3161 timestamp verification are
  tracked in [#142](https://github.com/gabomarin/yark/issues/142).

Read [Security & privacy](https://getyark.com/docs/security-privacy/) before sharing
logs, configurations, app data, or backup archives. To report a vulnerability in YARK
itself, see [`SECURITY.md`](SECURITY.md) (do not use public issues for security bugs).

## Development

### Requirements

- Windows is the primary development and packaging target.
- Node.js **22.12 or newer**.
- npm.

```bash
npm install
npm run dev
```

Optional local isolation (gitignored `.env.local`): set `YARK_E2E_USER_DATA` to a
folder so `npm run dev` never touches your real AppData profile. Add
`YARK_E2E_FULL_UI=true` if you still want splash, first-run setup, and What's new
on that isolated profile (see `.env.example`).

Common validation commands:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Validate TypeScript without emitting files. |
| `npm run lint` | Feature file-size caps, Actions pin check, and ESLint. |
| `npm run knip` | Unused files, exports, dependencies, and unused CSS files. |
| `npm test` | Run the Vitest unit and integration suite. |
| `npm run build` | Build the Electron application. |
| `npm run package` | Build the Windows NSIS installer. |
| `npm run e2e:smoke` | Launch the compiled Electron shell and run the smoke flow. |
| `npm run website:dev` | Run the Astro/Starlight website locally. |
| `npm run website:build` | Build the public website and operator documentation. |

`npm install` enables Husky hooks:

| Hook | Validation |
| --- | --- |
| Pre-commit | Typecheck and lint |
| Pre-push | Typecheck, tests, and lint |

GitHub Actions runs typecheck, lint, and tests on `windows-latest` in parallel with
build + Electron E2E (CRUD, install-health, host-port-probe) for pull requests
and pushes to `main`. Prepared-host ASA validation is tracked
separately because it needs a real-server environment.

<details>
<summary>WSL and Linux development notes</summary>

YARK targets Windows process, path, SteamCMD, PowerShell, and robocopy behavior. Linux and WSL can
still be useful for editing, typechecking, and selected tests, but Windows-specific paths and
Electron optional dependencies may behave differently.

For a Windows checkout mounted in WSL, the repository hooks delegate to `cmd.exe` so they
use the Windows Node installation and win32 dependencies. See [AGENTS.md](AGENTS.md) for the
current environment-specific run notes.

</details>

## Architecture

```text
src/
├── main/       Electron main-process composition
├── preload/    Explicit renderer API and IPC bridge
├── renderer/   React + TypeScript desktop interface
├── backend/    Domains, persistence, processes, filesystem, and operations
└── shared/     Cross-process contracts and shared types

workers/
└── curseforge-proxy/   Cloudflare Worker for CurseForge metadata

website/                Astro + Starlight product site and operator docs
```

Persistence uses Node's built-in `node:sqlite`; there is no separate backend service.

## Documentation

| Guide | Scope |
| --- | --- |
| [Server lifecycle](docs/server-lifecycle.md) | Launch composition, process identity, readiness, stop/restart, and recovery. |
| [RCON console](docs/rcon.md) | Persistent workspace RCON session, players, ban list, and IPC. |
| [Settings](docs/settings.md) | App-wide preferences, desktop shell, SteamCMD path, and density. |
| [Clusters](docs/clusters.md) | Transfer-compliance reports, cluster fields, and launch-arg trio. |
| [Mods](docs/mods.md) | Workspace CurseForge inventory, load order, metadata proxy, and `-mods=` launch. |
| [Updates and SteamCMD](docs/updates-steamcmd.md) | Caches, install/update/verify, safe-update flow, rollback, and Windows validation. |
| [Backups](docs/backups.md) | Archive types, schedules, restore policy, retention, and recovery behavior. |
| [Logs](docs/logs.md) | Events, runtime logs, update history, storage, and troubleshooting. |
| [Component structure](docs/component-structure.md) | Renderer composition and feature-file policy. |
| [Design system](docs/design-system.md) | Theme tokens, shared surfaces, interaction patterns, and visual conventions. |
| [Visual testing](docs/visual-testing.md) | Required evidence and helpers for visible UI changes. |
| [Website](docs/website.md) | Astro/Starlight development, screenshots, CI, and GitHub Pages deployment. |
| [Versioning](docs/versioning.md) | SemVer, changelog policy, packaging, signing state, and release checklist. |
| [Agent context](docs/agent-context.md) | Repository orientation for AI-assisted development. |

Public operator documentation lives at
[getyark.com/docs](https://getyark.com/docs/).

## Roadmap and contributing

- The live release sequence is maintained in
  [#21 — Release roadmap](https://github.com/gabomarin/yark/issues/21).
- Bugs, feature proposals, and focused maintenance work are tracked in
  [GitHub Issues](https://github.com/gabomarin/yark/issues).
- Repository and GitHub artifacts use English as the language of record.
- Pull requests normally use squash merge so `main` keeps one commit per completed issue.
- Before proposing a visible UI change, follow the evidence requirements in
  [docs/visual-testing.md](docs/visual-testing.md).

When reporting a problem, include the YARK version, relevant sanitized logs, expected behavior,
and reproduction steps. Never attach passwords, raw INI files, app databases, or unreviewed
backup archives.

## License

YARK server manager is distributed under the
[GNU General Public License v3.0](LICENSE) (GPL-3.0-only).

Third-party material embedded in the app (default INI templates, launch-options
catalog copy, and other assets) is listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

ARK: Survival Ascended and related names are trademarks of their respective owners. YARK is an
independent community project and is not affiliated with or endorsed by Studio Wildcard.
