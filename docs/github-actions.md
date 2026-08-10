# GitHub Actions supply chain

YARK pins every third-party Action to a full **immutable commit SHA** and keeps a
human-readable version comment on the line above each `uses:` entry. Mutable tags
(`@v4`, `@v2.3.2`, `@main`) are rejected by `npm run lint` via
[`scripts/lint-actions-pins.cjs`](../scripts/lint-actions-pins.cjs) (#148).

## Inventory

| Workflow | Purpose | Default permissions |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Typecheck, lint, test, build | `contents: read` |
| [`.github/workflows/website-ci.yml`](../.github/workflows/website-ci.yml) | Astro site build | `contents: read` |
| [`.github/workflows/changelog.yml`](../.github/workflows/changelog.yml) | Require Unreleased changelog | `contents: read`, `pull-requests: read` |
| [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) | Deploy site to GitHub Pages | `contents: read`, `pages: write`, `id-token: write` |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | Windows NSIS → GitHub Release | workflow `contents: read`; job elevates `contents: write` only to publish |

Release runs only when `github.repository == 'gabomarin/yark'` (tag push or
`workflow_dispatch`). It does not run on pull requests, so fork PRs cannot publish
releases or consume release write tokens.

Official Windows packages require repository variable
`YARK_CURSEFORGE_PROXY_URL` (baked into main at build time; see
[curseforge-proxy.md](curseforge-proxy.md)). The package job fails if that variable
is empty.

## Pin format

Put the human-readable version on the **same line** as the SHA. Dependabot uses that
inline comment when it proposes pin bumps; a comment on the previous line alone is not
enough for reliable updates.

```yaml
- name: Checkout
  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

- `# vX.Y.Z` records the upstream release that was reviewed (required by lint).
- `uses` must pin a **40-character** git SHA (not a tag, branch, or short SHA).
- Prefer Actions that already run on the current Actions Node runtime (Node 24 as of
  the #148 upgrade) so CI does not emit deprecated-runtime warnings.

Local composite Actions under `./…` are allowed without a SHA (none today).

## Reviewing Dependabot Action updates

Dependabot ([`.github/dependabot.yml`](../.github/dependabot.yml)) opens weekly PRs
that bump Action pins. For each PR:

1. Confirm the new SHA matches the tagged release (`git rev-parse` / GitHub release
   page “commit” link), not only the floating major tag.
2. Skim the upstream changelog / diff for the bump (especially for
   `softprops/action-gh-release`, which publishes with `contents: write`).
3. Prefer keeping SHA pins; do not merge a PR that reintroduces `@vN` tags.
4. Run or wait for CI; merge with the usual review.

Dependabot PRs that only touch workflows may use the `skip-changelog` label when
there is no operator-facing product change (or add a short Security/Changed note if
the bump is worth calling out).

## Emergency rollback

1. Identify the last known-good workflow commit on `main` (or the prior pin SHA from
   git history / the inline `# vX.Y.Z` comment).
2. Open a PR that restores the previous `uses: …@<sha>` lines (and matching comments).
3. Merge promptly; for a broken **release** workflow, use
   **Actions → Release Windows → Run workflow** on a known-good tag after the pin
   is restored.
4. If an upstream Action is actively compromised, remove or replace that step and
   rotate any secrets that workflow could have exposed (`GITHUB_TOKEN` scopes are
   job-limited; still treat write jobs as high risk).

## Provenance (Windows release)

1. Tag `vX.Y.Z` on the commit that passed CI on `main` (see [versioning.md](versioning.md)).
2. `release.yml` checks out **that tag** (`ref: steps.tag.outputs.name`), verifies
   `package.json` version alignment, runs typecheck + tests, then packages NSIS.
3. Artifacts upload and the GitHub Release attach the same `dist/*.exe` / `*.yml`
   built from that tagged tree — not from an unrelated branch tip.

Do **not** treat a SHA pin as a substitute for reading upstream release notes when
bumping Actions.
