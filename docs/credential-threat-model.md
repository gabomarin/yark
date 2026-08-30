# Local credential threat model

YARK stores ASA **admin** and optional **join** passwords so it can write
`GameUserSettings.ini`, authenticate loopback RCON, and clone or copy
profiles. This document is the written protection boundary for [#144](https://github.com/gabomarin/yark/issues/144).

YARK does **not** encrypt the SQLite copy. ASA already requires the same values
in plaintext `GameUserSettings.ini`, and the trust boundary is the local Windows
user. Encrypting only the database would not change who can read the secrets.

## Inventory

| Secret | SQLite (`servers`) | ASA INI | Process command line | IPC list / Edit | UI | Diagnostics |
| --- | --- | --- | --- | --- | --- | --- |
| Admin password (`ServerAdminPassword` / RCON) | Plaintext column (`admin_password`) | Required plaintext so `ArkAscendedServer.exe` can read it | **Not** passed as a launch arg | Returned on the profile so Edit can show the masked field | `PasswordInput` (masked) | Password **settings omitted** from GUS/config dumps; leftover assignments redacted |
| Join password (`ServerPassword`) | Plaintext column or SQL `NULL` | Required plaintext when set | **Not** a YARK-owned launch arg | Same as admin | `PasswordInput` (masked) | Same omit/redact rules |
| Assistant / CurseForge API keys | Not stored in the profile DB | n/a | n/a | n/a | n/a | Worker errors redact `x-api-key` / Bearer ([#134](https://github.com/gabomarin/yark/issues/134) is separate) |

Other copies:

- **INI backup ZIPs** (`kind: ini`) include `GameUserSettings.ini` with the same plaintext ASA keys.
- **Profile DB snapshots** (`profile-db-snapshots/`) are SQLite copies of the live DB, including plaintext password columns.
- **Import install** probe may return passwords discovered in an existing GUS file so the operator can confirm them. That payload is intentional, not a diagnostic dump.
- **Config transfer** copies passwords only when the operator opts in; cluster INI previews omit YARK-owned password keys.

## Trust boundaries

### SQLite (YARK profile DB)

Under `%APPDATA%` (Electron `userData`). Columns are ordinary TEXT. Another
Windows user on the same PC cannot read that profile directory with default
ACLs. Anyone who can already run as this Windows user can read the file — the
same as `GameUserSettings.ini`.

### INI files

ASA requires `[ServerSettings] ServerAdminPassword` and `ServerPassword` in
`GameUserSettings.ini`. YARK will not encrypt those values in a way that
prevents the dedicated server from reading them. Anyone who can read the
install tree as the same Windows user can read them. That is residual risk,
not a bug.

### Process command line

YARK writes credentials into INI before spawn. They are not added to the
CreateProcess command line. Extra-argument **preview** still redacts
password-like tokens (`redactLaunchArgForPreview`).

### UI and IPC

Create / Edit / clone / import send or return profile passwords so the
operator can change the masked fields. Generic diagnostic channels (log
export, IPC `ok: false`, event text, runtime console) do not reprint GUS
password settings.

### Diagnostics and support

When a log, crash excerpt, event, or export must show GameUserSettings or
server configuration, YARK **drops** `ServerAdminPassword` / `ServerPassword`
(and matching JSON fields) instead of echoing them, even as bullets. Inline
leaks (`ServerAdminPassword=…` in an error string) and known live secrets are
redacted. Sanitized **support bundles** ([#85](https://github.com/gabomarin/yark/issues/85))
must reuse these rules.

## Backup and restore

| Artifact | Credentials | Restore |
| --- | --- | --- |
| World / players ZIP | None | Unaffected |
| INI ZIP | Plaintext GUS passwords | Restores onto disk as ASA needs them |
| Profile DB + snapshots | Plaintext password columns | Same Windows user. Treat copies like the live DB. |

## File-permission expectations

`userData` lives in the operator’s Windows profile directory. Explorer /
default ACLs already restrict that tree to the account. YARK does not
loosen those ACLs and does not claim an extra DACL beyond the OS default.

INI files live under each `installDir` with whatever ACL that folder already
has (often inherited from the disk). Treat install folders as trusted.

## Residual risk (out of scope)

- Same-user malware, memory dumps, or an unlocked session
- Plaintext ASA INI, INI backup ZIPs, and the SQLite profile copy
- Operator-pasted passwords in screenshots or GitHub issues
- Replacing Windows account / BitLocker / device encryption

## Module map

| Role | Path |
| --- | --- |
| Omit + redact | `src/shared/credential-redaction.ts` |
| IPC errors | `src/main/ipc-validate.ts` |
| Events | `src/backend/infra/db/server-repository.ts` (`addEvent` / `recentEvents`) |
| Log list / export / runtime / update-log reads | `src/backend/domains/logs/logs-service.ts` |
| Runtime console ring | `src/backend/infra/process/process-manager.ts` |
| Crash excerpts | `src/backend/domains/instances/instance-crash.ts` |
| Cluster INI previews (omit owned keys) | `src/backend/domains/config/ini-compose.ts` |

Related operator copy: [Security & privacy](https://getyark.com/docs/security-privacy/),
[`SECURITY.md`](../SECURITY.md), [profile-database.md](profile-database.md),
[logs.md](logs.md), [backups.md](backups.md).
