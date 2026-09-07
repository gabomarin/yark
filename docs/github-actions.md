# GitHub Actions supply chain

YARK pins every third-party Action to a full **immutable commit SHA** and keeps a
human-readable version comment on the line above each `uses:` entry. Mutable tags
(`@v4`, `@v2.3.2`, `@main`) are rejected by `npm run lint` via
[`scripts/lint-actions-pins.cjs`](../scripts/lint-actions-pins.cjs) (#148).

## Inventory

| Workflow | Purpose | Default permissions |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Parallel `windows-latest` jobs: typecheck + lint + knip + test; build + Electron E2E CRUD / install-health / host-port-probe (#12) | `contents: read` |
| [`.github/workflows/website-ci.yml`](../.github/workflows/website-ci.yml) | Astro site build | `contents: read` |
| [`.github/workflows/changelog.yml`](../.github/workflows/changelog.yml) | Require Unreleased changelog | `contents: read`, `pull-requests: read` |
| [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) | Deploy site to GitHub Pages | `contents: read`, `pages: write`, `id-token: write` |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | Windows NSIS → GitHub Release; Discord `#releases` notify after assets upload | workflow `contents: read`; job elevates `contents: write` only to publish |
| [`.github/workflows/discord-release-notify.yml`](../.github/workflows/discord-release-notify.yml) | Manual Discord re-announce for an existing tag (`workflow_dispatch`) | `contents: read` |

Release runs only when `github.repository == 'gabomarin/yark'` (tag push or
`workflow_dispatch`). It does not run on pull requests, so fork PRs cannot publish
releases or consume release write tokens.

### Discord release notify

After **Release Windows** finishes creating the GitHub Release **with installer
assets**, the same job posts the tag and release-notes body to Discord
(`scripts/ci/discord-release-notify.py`) **as the Yark Bot Discord application**.
It refuses to post if the release has no assets yet.

1. Discord Developer Portal → your **Yark Bot** application → Bot → copy the
   token. Ensure the bot is invited to the YARK server with **Send Messages** in
   `#releases`.
2. In GitHub: repo **Settings → Secrets and variables → Actions** → New
   repository secret `DISCORD_BOT_TOKEN` → paste the bot token.
3. Channel id defaults to YARK `#releases`
   (`1546322340659339395`). Override with repo variable
   `DISCORD_RELEASES_CHANNEL_ID` if the channel moves.
4. Optional dry-run: Actions → **Discord release notify** → Run workflow → enter
   a tag that already has assets (e.g. `v0.20.0`).
5. Legacy fallback: secret `DISCORD_RELEASES_WEBHOOK_URL` still works if the bot
   token is unset (posts under the webhook’s own name, not Yark Bot).

The notifier uses Python + the Discord HTTP API only (no third-party Discord
Action). Requests set an explicit `User-Agent` (Cloudflare returns `403` /
error `1010` for Python-urllib’s default UA). Auto-generated “What’s Changed”
bullets whose title is the SemVer cut PR (`release: vX.Y.Z`) are stripped before
posting — they are not operator changelog. Message `flags` include
`SUPPRESS_EMBEDS` so GitHub links do not expand into preview cards. Long release
notes are truncated to Discord’s 2000-character limit with a pointer to the full
GitHub release page. On **Release Windows**, Discord notify uses
`continue-on-error` so a Discord outage does not fail the packaging job after
assets are already published.

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
   After packaging, `npm run verify:fuses` asserts `build.electronFuses` on
   `dist/win-unpacked` (#217). That script `require.resolve`s `@electron/fuses`
   (direct `devDependency`; electron-builder's nested copy is not on Node's
   resolve path).
3. Artifacts upload and the GitHub Release attach the same `dist/*.exe` / `*.yml`
   built from that tagged tree — not from an unrelated branch tip.

Do **not** treat a SHA pin as a substitute for reading upstream release notes when
bumping Actions.
