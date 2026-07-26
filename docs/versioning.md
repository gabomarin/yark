# Versioning

YARK server manager uses **Semantic Versioning** (`MAJOR.MINOR.PATCH`) and a
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) file at the repo root.

## Source of truth

| Surface | Where |
| --- | --- |
| Package / installer version | `package.json` → `"version"` |
| UI sidebar (`vX.Y.Z`) | `src/shared/app-version.ts` (imports `package.json`) |
| electron-builder artifacts | reads `package.json` automatically |
| Human-readable history | `CHANGELOG.md` |

Do **not** hardcode a second app version string in React components. Import
`APP_VERSION` from `@shared/app-version` when the UI needs it.

## SemVer rules for this project

- **PATCH** (`0.1.0` → `0.1.1`): bug fixes, copy tweaks, non-breaking polish.
- **MINOR** (`0.1.0` → `0.2.0`): new features that stay backward compatible for
  existing local data (SQLite profiles, INI layouts, SteamCMD paths).
- **MAJOR** (`0.x` → `1.0.0`, or `1.x` → `2.0.0`): breaking changes users must
  notice — e.g. DB schema/appId migration that abandons previous installs,
  removed IPC contracts, or incompatible profile formats.

While the product is a **work-in-progress preview** (`0.x`), prefer MINOR bumps
for user-visible feature batches and PATCH for hotfix builds. Promote to
`1.0.0` only when CurseForge / public packaging is intentionally “stable”.

## Release checklist

1. Move items from `## [Unreleased]` in `CHANGELOG.md` into a new section
   `## [X.Y.Z] - YYYY-MM-DD` with `Added` / `Changed` / `Fixed` / `Removed` as needed.
2. Bump `package.json` `"version"` to `X.Y.Z` (and refresh the lockfile metadata
   via `npm version X.Y.Z --no-git-tag-version` if you want npm to edit it).
3. Confirm the sidebar shows `vX.Y.Z` after `npm run dev` / build (driven by
   `APP_VERSION`).
4. Run verification appropriate to the change:
   - `npm run typecheck`
   - `npm test`
   - `npm run build` (and `npm run package` for a Windows installer cut)
5. Commit with a message that names the version (e.g. `release: v0.2.0`).
6. Tag `vX.Y.Z` when publishing a build others will install.
7. Leave a fresh empty `## [Unreleased]` section at the top of `CHANGELOG.md`
   for the next cycle.

## What belongs in the changelog

Include:

- User-visible features, UX changes, and remediations.
- Breaking behavior (migrations, renamed product surfaces, API-key requirements).
- Dependency upgrades that affect runtime security or Electron major versions.

Skip:

- Pure refactors with no behavior change.
- Internal agent/TODO notes.
- Formatting-only churn.

## Preview / CurseForge note

Public reviewers should treat `0.x` builds as evolving. Call out WIP limitations
in the release notes (e.g. Mods tab deferred, placeholder Clusters/Settings pages)
so expectations stay aligned with the README.
