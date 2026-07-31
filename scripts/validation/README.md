# Validation scripts (manual only)

These helpers are for **interactive Windows** validation. They are **not** part of CI.

## `validate-safe-update.cjs`

Real-host proof for safe update / verify (GitHub #14). Drives the compiled Electron
app via Playwright against a disposable ASA profile.

### Requirements

- Windows (`win32`) with a display
- Node **22.5+** — uses the built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html)
  module (same API the Electron app uses via `node:sqlite` / `DatabaseSync`). This is
  **not** `better-sqlite3`.
- `npm install` (Playwright) and `npm run build`
- A configured SteamCMD path and a **test-owned** ASA server profile

### Safety

- Does **not** rename or replace AppData `steamcmd.exe`.
- Scenario C compiles a failing stub under `os.tmpdir()`, points Settings
  `steamcmdPath` at it, then restores the previous path.
- Still mutates the chosen disposable profile (stop/start, backups, world files).

### Run

```powershell
npm run build
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
node scripts/validation/validate-safe-update.cjs --dry-run
node scripts/validation/validate-safe-update.cjs --confirm
```

`--force` is an alias of `--confirm`. See [docs/updates-steamcmd.md](../../docs/updates-steamcmd.md#real-host-validation-windows).
