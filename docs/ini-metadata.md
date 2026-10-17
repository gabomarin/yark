# INI setting metadata and ownership

PINI-016 / [#659](https://github.com/gabomarin/yark/issues/659).

YARK keeps one generated catalog for GameUserSettings / Game setting metadata.
Ownership, absence policy, enforcement, and provenance live on that catalog so
visual editors, compose/strip, and future import work share one decision path.

## Sources

| Input                                                                                    | Role                                                                                    |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`src/shared/defaults/*.ini`](../src/shared/defaults/)                                   | Annotated defaults → descriptions, value types, inferred inputs                         |
| [`ini-setting-input-overrides.json`](../src/shared/ini/ini-setting-input-overrides.json) | Optional hand-tuned editor inputs                                                       |
| [`ini-setting-ownership-seed.json`](../src/shared/ini/ini-setting-ownership-seed.json)   | Non-default ownership / absence / enforcement / provenance                              |
| [`ini-setting-meta-enums.json`](../src/shared/ini/ini-setting-meta-enums.json)           | Shared owner / absence / enforcement / confidence vocabulary for builder + diagnostics  |
| `npm run catalog:ini-meta`                                                               | Writes deterministic [`ini-setting-meta.json`](../src/shared/ini/ini-setting-meta.json) |

Do not add a second settings catalog. Prefer `@shared/ini/ini-setting-meta` and
`@shared/ini/ini-setting-decisions` over inventing parallel registries.
[`asa-server-settings.ts`](../src/shared/asa/asa-server-settings.ts) remains a
thin compatibility facade.

## Ownership

| `owner`          | Meaning                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `serverProfile`  | Authoritative on the server profile (identity, ports, RCON, credentials). Excluded from visual INI editing.  |
| `iniVisual`      | Supported in the Configuration / template visual editors.                                                    |
| `externalManual` | Reserved for tools/mods that own a key; not used by the seed today.                                          |
| `system`         | YARK policy surface other than Server Settings (e.g. ASE-legacy mod INI keys). Excluded from visual editing. |

Unknown runtime keys (not in the catalog) stay **unknown**. The parser and Raw
editor still see them; the visual editor may show them as custom rows, but
metadata lookups must not invent an owner or default.

[`yark-owned-ini-keys.ts`](../src/shared/asa/yark-owned-ini-keys.ts) is a
compatibility facade over the ownership seed / catalog for strip and sync call
sites. New code should use `isVisuallyEditableIniSetting` /
`isCatalogOwnedIniKey` from `ini-setting-decisions`.

**MaxPlayers** is not catalog-owned. ASA ignores INI MaxPlayers; the live cap is
`-WinLiveMaxPlayers`. Strip and visual filters still drop it via
`isAsaIgnoredIniMaxPlayers`.

## Absence policy

| Policy              | Meaning                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `allowed`           | Key may be absent; absence is not a catalog default.               |
| `forbidden`         | After intentional profile sync, the key is expected to be present. |
| `mapsToProfileNull` | Absence maps to a nullable profile field (e.g. empty passwords).   |

Opening or saving must never materialize a guessed default solely because a
catalog entry exists.

## Enforcement

| Level      | Intent                                                                               |
| ---------- | ------------------------------------------------------------------------------------ |
| `blocking` | Structural / YARK invariant (metadata only here; save validators may consume later). |
| `warning`  | Documented but uncertain compatibility.                                              |
| `advisory` | Heuristics and soft guidance.                                                        |

This ticket stores and looks up enforcement levels. It does not add new save-time
validators.

## Provenance

Each entry has `provenance: { source, reviewedAt, confidence }`:

- Catalog defaults from annotated INI comments use `confidence: "inferred"` and
  `reviewedAt: null`.
- Ownership-seed rows use `confidence: "verified"` with a fixed `reviewedAt`.
  A small starter set of visual keys (e.g. `DifficultyOffset`, `AdminLogging`,
  `XPMultiplier`) is also marked verified for PINI-002 UI demos; grow this only
  with an explicit review date and source.

Tier-2 fields (`restartImpact`, `conflicts`) stay omitted/null until verified.
Unknown metadata remains unknown.

## Catalog relation indicators (PINI-002 / #663)

Visual rows show a dimmed **Custom** / **Default** / **Unset** / **Unknown**
label from the **saved** value vs a **verified** catalog default only
(`lookupVerifiedIniDefault`). Inferred project defaults never count as Default.
**Unset** (action) removes an occurrence when `absencePolicy` is `allowed` and
must not invent a default. Unsaved draft highlighting (`*`, PINI-001) stays
separate.

## Visual vs raw

- **Visual:** `isVisuallyEditableIniSetting` hides profile/system-owned keys,
  MaxPlayers, and client noise.
- **Raw:** Full file text, including owned and unknown keys.
- **Strip/templates:** Still remove owned keys + MaxPlayers before template apply;
  profile sync recomposes profile-owned keys afterward.
- **Unsaved rows (PINI-001 / #661):** Visual rows compare against the editor
  baseline (load / last successful Save). Within each section+key group, draft
  duplicates are matched to saved values by equal value first (so raw inserts /
  reorders do not steal the wrong baseline), then by remaining order. Dirty rows
  show an accessible Unsaved marker (`*`), **Last saved**, and per-row revert
  (distinct from reset to catalog default). Keys present only in the draft
  revert by removing that occurrence (`setIniTextValue` / `removeIniTextValue`
  still address the draft occurrence index). Filter counts disclose pending rows
  even when filtered out.

## Import / sync contract (types only)

`INI_IMPORT_PRECEDENCE` in `ini-setting-decisions` records:

1. Profile is authoritative for `serverProfile` keys after intentional sync.
2. Raw INI occurrences are preserved until that sync is intentional.
3. Conflicts are reported, not treated as independent visual settings.
4. Absence is not a catalog default.

Full import UI is PINI-010 / PINI-011; semantic patch save is PINI-004.

## Diagnostics

`diagnoseIniSettingMetaCatalog()` checks duplicate identities, unsupported enums,
stale verified provenance, and seed ↔ catalog ownership consistency. Unit tests
expect an empty diagnostic list after `catalog:ini-meta`.

## Related docs

- [server-lifecycle.md](server-lifecycle.md) — INI read/save, profile sync, pending writes
- [config-transfer.md](config-transfer.md) — selection compose and owned-key reapply
- [clusters.md](clusters.md) — cluster INI templates
- [settings.md](settings.md) — catalog rebuild note
