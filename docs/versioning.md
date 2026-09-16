# Versioning

YARK server manager uses **Semantic Versioning** (`MAJOR.MINOR.PATCH`) and a
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) file at the repo root.

## Source of truth

| Surface | Where |
| --- | --- |
| Package / installer version | `package.json` → `"version"` |
| UI sidebar (`vX.Y.Z`) | `src/shared/app-version.ts` (imports `package.json`) |
| electron-builder artifacts | reads `package.json` automatically |
| Human-readable history | `CHANGELOG.md` (+ curated `src/shared/settings/changelog.ts` for site + in-app What's new) |
| Project site hero pill / download CTA | `website/src/data/site.ts` (reads root `package.json` `version`) |

Do **not** hardcode a second app version string in React components. Import
`APP_VERSION` from `@shared/app-version` when the UI needs it. Bumping
`package.json` updates the site pill and download URL automatically (see
[website.md](website.md)); keep `src/shared/settings/changelog.ts` in sync when
cutting a release (`website/src/data/changelog.ts` re-exports it).

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

Supply-chain pins, permissions, and Action update/rollback: [github-actions.md](github-actions.md).

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
  Operators use Settings → **About** (or the accented sidebar version). Install is
  blocked while ASA servers or critical jobs are busy. Dev/unpackaged builds can check
  versions but cannot install. While the installed app is `0.x`, GitHub prereleases are
  treated as update candidates (`allowPrerelease`); from `1.0.0+` only production releases.
- **Installer UI:** NSIS uses assisted mode (`oneClick: false`). Fresh installs show
  the Windows wizard (including the GPL license page), allow choosing the destination,
  and create desktop and Start menu shortcuts. In-app updates still use the updater's
  unattended install path.
- **Electron fuses / ASAR integrity (#217):** `package.json` → `build.electronFuses`
  flips production hardening after pack (before any future code signing). `asar: true`
  stays on so electron-builder embeds Windows ASAR integrity resources. Release CI runs
  `npm run verify:fuses` against `dist/win-unpacked`. The script needs the
  `@electron/fuses` **direct** `devDependency` (`require.resolve` of its CLI
  does not see electron-builder's nested copy).

| Fuse | Packaged value | Why |
| --- | --- | --- |
| `runAsNode` | off | Blocks `ELECTRON_RUN_AS_NODE` turning the shipped `.exe` into plain Node (SteamCMD/ASA still use normal `spawn`, not `process.fork`) |
| `enableCookieEncryption` | on | OS-backed Chromium cookie store encryption |
| `enableNodeOptionsEnvironmentVariable` | off | Ignores `NODE_OPTIONS` / `NODE_EXTRA_CA_CERTS` injection |
| `enableNodeCliInspectArguments` | off | Ignores `--inspect` / related main-process debugger flags |
| `enableEmbeddedAsarIntegrityValidation` | on | Validates `app.asar` against the embedded integrity hash (Electron ≥ 30 on Windows) |
| `onlyLoadAppFromAsar` | on | Loads app code only from `app.asar` (no unpacked `app/` sideload bypass) |
| `loadBrowserProcessSpecificV8Snapshot` | off | No custom main-process V8 snapshot |
| `grantFileProtocolExtraPrivileges` | on | Required while the shell loads the renderer via `loadFile` (`file://`); turn off only after migrating to a custom protocol |

Unpackaged `npm run dev` / `npm start` still use Electron’s default fuse wire. E2E/visual helpers unset `ELECTRON_RUN_AS_NODE` for those workflows; that env escape is disabled only on packaged binaries.

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

### Phase 0 — Pre-release quality gates

Run these **before** bumping any version or touching the changelog. Every gate
must pass; a failure blocks the release until fixed.

1. **Bugbash** — manual walkthrough of the main operator flows on the current
   `main` build:
   - Create / clone / delete a server.
   - Start → running → RCON-ready → Stop / Restart.
   - Backup create → restore (test-owned profile only).
   - INI visual editor: open, edit a key, save, verify diff preview.
   - Mods: browse, install, remove.
   - Logs: filter by severity, open runtime / update / backup logs.
   - Settings: each category (General, Profiles, SteamCMD, Log files, About).
   - Downloads: queue a SteamCMD job, pause → resume.
   - Keyboard: Ctrl+K Spotlight, Shift+F10 card menu, Escape to dismiss.
   Record pass/fail per flow; note any regressions vs the previous release.

2. **React Doctor** — renderer/backend hygiene (not a merge gate, but a
   pre-release snapshot):
   ```
   npx react-doctor@latest --verbose --scope changed
   npx react-doctor@latest design --verbose
   ```
   Avoid regressing newly introduced **errors**. Do not mass-fix warnings.
   See [react-doctor.md](react-doctor.md) for baseline and rules turned off.

3. **Static analysis**
   ```
   npm run typecheck
   npm run lint
   npm run knip
   ```
   All three must be clean. `knip` catches unused files, exports, and deps;
   see [knip.md](knip.md).

4. **Unit / integration tests**
   ```
   npm test
   ```
   All tests green. On Linux, the ~8 Windows-path tests are expected failures;
   validate via `cmd.exe /c "npm test"` on Windows or in CI.

5. **E2E suite** — run the full matrix appropriate to the changes shipped
   ([e2e-validation.md](e2e-validation.md)):
   ```
   npm run build
   npm run e2e:smoke          # empty-fleet overview
   npm run e2e:keyboard        # Ctrl+K, Shift+F10, Escape
   npm run e2e                 # CRUD + shell nav (CI gate)
   npm run e2e:install-health  # install-state badges
   npm run e2e:host-port-probe # UDP conflict modal
   ```
   Add any **UI-changing** script from the mapping table in `e2e-validation.md`
   (e.g. `e2e:mods`, `e2e:launch-args`, `e2e:clusters-membership`) when the
   release touches those surfaces. All must pass on Windows.

6. **Production build + bundle report**
   ```
   npm run build
   npm run build:report
   ```
   Confirm the bundle report shows no unexpected chunk growth. Optionally run
   `npm run package` locally for a smoke of the NSIS installer.

### Phase 1 — Changelog + version bump

7. Move items from `## [Unreleased]` in `CHANGELOG.md` into a new section
   `## [X.Y.Z] - YYYY-MM-DD` with `Added` / `Changed` / `Fixed` / `Removed`
   / `Docs` / `Security` as needed.
8. Bump `package.json` `"version"` to `X.Y.Z` (and refresh the lockfile
   metadata via `npm version X.Y.Z --no-git-tag-version` if you want npm to
   edit it).
9. Confirm the sidebar shows `vX.Y.Z` after `npm run dev` / build (driven by
   `APP_VERSION` from `src/shared/app-version.ts`).
10. Sync the curated changelog in `src/shared/settings/changelog.ts` (site +
    in-app What's new; `website/src/data/changelog.ts` re-exports it). Version
    pill / download CTA follow `package.json` via `website/src/data/site.ts`.

### Phase 2 — Website / docs

11. If the release includes **visual renderer changes**: re-capture screenshots
    (`scripts/capture-website-screenshots.cjs`) and update
    `website/public/screenshots/`. Follow [website.md](website.md) and
    [visual-testing.md](visual-testing.md).
12. Verify `website/src/data/site.ts` reads the new version from `package.json`
    (download CTA URL and version pill update automatically).
13. Sync operator docs if runbooks or IPC contracts changed — check that
    `website/src/content/docs/docs/` mirrors the latest `docs/` runbooks.

### Phase 3 — Commit, tag, push

14. Commit with a message that names the version (e.g. `release: v0.21.0`) and
    merge to `main` (squash merge is the default).
15. Tag `vX.Y.Z` on that commit and `git push origin vX.Y.Z` — CI publishes
    the installer to the GitHub Release.
16. Leave a fresh empty `## [Unreleased]` section at the top of `CHANGELOG.md`
    for the next cycle.

### Phase 4 — Post-release verification

17. Watch **Actions → Release Windows** in GitHub Actions; confirm the workflow
    succeeds and the `.exe` + `latest.yml` assets are uploaded.
18. Download the published installer, compare its GitHub-provided SHA-256
    digest, and confirm the public site's release-trust copy matches reality.
    Once #142 lands, also verify Authenticode, publisher identity, and
    timestamp before considering the release complete.
19. Confirm `https://getyark.com/` reflects the new version (hero pill,
    download CTA) and the changelog page shows the new entry.
20. Submit `https://getyark.com/sitemap-index.xml` in Search Console if SEO
    indexing is a concern for this release.

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
