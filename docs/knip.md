# Knip (unused code and dependency checks)

Knip scans the root Electron app for dead code and dependency drift. GitHub Actions
runs it on every pull request and push to `main`; **Husky hooks do not**, so CI is
often the first place unused exports show up after a refactor.

## When to run

Run `npm run knip` locally before you commit or push when you:

- add or remove files, exports, or npm dependencies;
- rename or move modules;
- extract helpers and leave old re-exports behind;
- add CSS modules or shared UI atoms.

For a quick pre-PR sweep, run the same checks CI uses:

```bash
npm run typecheck
npm run lint
npm run knip
npm test
```

Husky already runs typecheck + lint on **pre-commit** and typecheck + test + lint on
**pre-push**. Add knip yourself when the change touches surface area Knip cares about
(exports, entry files, deps). A full gate before opening a PR:

```bash
npm run typecheck && npm run lint && npm run knip && npm test
```

On WSL with a Windows checkout, use the same `cmd.exe /c` pattern as other npm scripts
if win32 `node_modules` are required.

## What it checks

Configuration lives in [`knip.jsonc`](../knip.jsonc). All listed rules are **errors**
(no warnings-only drift):

| Rule | Typical failure |
| --- | --- |
| `files` | Source file never imported (not an entry) |
| `exports` / `nsExports` | Named export nothing imports |
| `types` / `nsTypes` | Exported type never used |
| `dependencies` / `devDependencies` | Package in `package.json` but unused |
| `unlisted` | Import without a matching dependency |
| `unresolved` | Import path Knip cannot resolve |
| `duplicates` | Same dependency listed twice |
| `binaries` | Spawned executable not allowlisted |

Knip does **not** flag unused CSS **classes** inside a `.module.css` file — only
unused CSS **files**. `website/` and `workers/` are separate packages and ignored here.

Entry globs (`scripts/**/*.cjs`, splash HTML, documented design-system atoms) and
`ignore`/`ignoreDependencies` entries are intentional; read `knip.jsonc` before adding
new exceptions.

## Fixing common failures

### Unused export

Prefer the smallest fix:

1. **Drop `export`** if the symbol is only used in the same file.
2. **Delete** the symbol if nothing uses it anymore.
3. **Wire it up** if you meant to use it in UI or tests.

Avoid exporting “for later” from feature models — Knip treats every export as public API.

Example after a refactor:

```diff
-export function formatJobWarningsLabel(warnings: MaintenanceJobWarnings): string {
+function formatJobWarningsLabel(warnings: MaintenanceJobWarnings): string {
```

### Unused file

- Delete the file if it is truly dead.
- If it is a deliberate entry (script, HTML shell, documented atom), add it to
  `entry` in `knip.jsonc` with a one-line comment explaining why.
- Do **not** add whole feature folders to `ignore` to silence noise.

### Unused dependency

- Remove the package from `package.json` if nothing imports it.
- If the dependency is referenced only in config (e.g. Babel plugin string), add it to
  `ignoreDependencies` with a comment — see `babel-plugin-react-compiler` in
  `knip.jsonc`.

### `@lintignore` tag

Some cross-package re-exports use `@lintignore` in JSDoc so Knip skips a known edge
case (`tags: ["-lintignore"]` in `knip.jsonc`). Use sparingly and document why.

## CI

The **Typecheck, lint, knip, test** job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
runs `npm run knip` on `windows-latest`. A failing knip step blocks merge the same way
as typecheck or lint.

## Related docs

- [agent-context.md](agent-context.md) — recommended verification before closing work
- [component-structure.md](component-structure.md) — ESLint + size caps (Husky + CI)
- [AGENTS.md](../AGENTS.md) — agent command summary
