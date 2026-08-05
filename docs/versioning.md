# Versioning

YARK server manager uses **Semantic Versioning** (`MAJOR.MINOR.PATCH`) and a
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) file at the repo root.

## Source of truth

| Surface | Where |
| --- | --- |
| Package / installer version | `package.json` → `"version"` |
| UI sidebar (`vX.Y.Z`) | `src/shared/app-version.ts` (imports `package.json`) |
| electron-builder artifacts | reads `package.json` automatically |
| Human-readable history | `CHANGELOG.md` (+ curated `website/src/data/changelog.ts` for the site) |
| Project site hero pill / download CTA | `website/src/data/site.ts` (reads root `package.json` `version`) |

Do **not** hardcode a second app version string in React components. Import
`APP_VERSION` from `@shared/app-version` when the UI needs it. Bumping
`package.json` updates the site pill and download URL automatically (see
[website.md](website.md)); keep `website/src/data/changelog.ts` in sync when
cutting a release.

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

## Day-to-day vs publish

| Moment | What happens |
| --- | --- |
| Feature / fix work | One GitHub issue → one PR into `main`; note user-visible changes under `## [Unreleased]` |
| Publish an installer | Bump SemVer, move Unreleased → `[X.Y.Z]`, tag `vX.Y.Z`, CI builds the Windows NSIS `.exe` |

Do **not** cut a new version/tag on every merge. Group merged tickets into a MINOR
(or PATCH hotfix) when the build is worth installing.

### PR gate: changelog required

Workflow: [`.github/workflows/changelog.yml`](../.github/workflows/changelog.yml)

- Every PR must **change** the `## [Unreleased]` section of root `CHANGELOG.md` (a short bullet under Added/Changed/Fixed/…). Editing only older version sections does not pass.
- Escape hatch: GitHub label **`skip-changelog`** for non-user-facing chore/CI/docs-only PRs.
- Agents: keep notes concise — see [`.cursor/rules/changelog.mdc`](../.cursor/rules/changelog.mdc).

## GitHub Actions release

Workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

- **Trigger:** push of tag `v*` (or manual **workflow_dispatch** with an existing tag).
- **Runner:** `windows-latest` → `npm run package` (electron-builder NSIS).
- **Gate:** `package.json` `"version"` must match the tag without `v`, or the tag may
  add a channel label on that same base (`v0.1.0` ↔ `0.1.0`, or `v0.1.0-alpha` ↔ `0.1.0`).
  The NSIS installer still embeds the `package.json` version (not the tag suffix).
- **Output:** GitHub Release with `dist/*.exe` (and `*.yml` metadata). Tags that are
  `0.x` or include a SemVer prerelease label (`-alpha`, `-beta.1`, …) are marked
  **prerelease**.
- **Artifact name:** `build.artifactName` pins `YARK-server-manager-Setup-${version}.${ext}`.
  Keep it space-free: GitHub rewrites spaces in uploaded asset names to dots, while
  electron-updater's `latest.yml` uses dashes, and the mismatch makes in-app updates
  fail with a 404. `website/src/data/site.ts` builds the download CTA from this same name.
- **Signing:** builds are currently **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY=false`).
  Windows SmartScreen may warn until Authenticode signing and RFC 3161 timestamp verification
  are implemented in #142.
- **In-app updater (#165):** `package.json` `build.publish` points at `gabomarin/yark` so
  packaged apps resolve release metadata even though CI still packages with `--publish never`.
  Operators use Settings → **YARK updates** (or the accented sidebar version). Install is
  blocked while ASA servers or critical jobs are busy. Dev/unpackaged builds can check
  versions but cannot install. While the installed app is `0.x`, GitHub prereleases are
  treated as update candidates (`allowPrerelease`); from `1.0.0+` only production releases.
- **Installer UI:** NSIS uses assisted mode (`oneClick: false`). Fresh installs show
  the Windows wizard (including the GPL license page), allow choosing the destination,
  and create desktop and Start menu shortcuts. In-app updates still use the updater's
  unattended install path.

### Local `npm run package` on Windows

If packaging fails extracting `winCodeSign` with:

`Cannot create symbolic link … privilegio requerido … libcrypto.dylib`

electron-builder is unpacking a cache archive that contains **macOS symlinks**. Windows
blocks that unless the process can create symlinks. Fixes (pick one):

1. **Recommended:** Settings → System → For developers → **Developer Mode** = On, then
   delete `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` and retry `npm run package`.
2. Run the terminal **as Administrator** once (same cache clear helps).
3. CI (`windows-latest`) normally has symlink rights; this is mostly a local-dev issue.

After the release commit is on `main`:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Then watch **Actions → Release Windows**. Rebuild an existing tag via
**Actions → Release Windows → Run workflow**.

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
   - `npm run build` (optional local `npm run package` smoke)
5. Sync the curated site changelog in `website/src/data/changelog.ts` (version
   pill / download CTA follow `package.json` via `website/src/data/site.ts`).
6. Commit with a message that names the version (e.g. `release: v0.2.0`) and merge
   to `main`.
7. Tag `vX.Y.Z` on that commit and `git push origin vX.Y.Z` — CI publishes the
   installer to the GitHub Release.
8. Leave a fresh empty `## [Unreleased]` section at the top of `CHANGELOG.md`
   for the next cycle.
9. Download the published installer, compare its GitHub-provided SHA-256 digest, and confirm the
   public site's release-trust copy matches reality. Once #142 lands, also verify Authenticode,
   publisher identity, and timestamp before considering the release complete.

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
in the release notes (e.g. unsigned builds, unsigned packaging, remaining polish)
so expectations stay aligned with the README.
