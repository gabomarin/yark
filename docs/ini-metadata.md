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

Tier-2 fields (`restartImpact`, `conflicts`) stay omitted/null until verified.
Unknown metadata remains unknown.

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

Import compatibility reporting is PINI-011. Reading complex tuple and list lines without rewriting them is PINI-010 (#680). See [Complex values](#complex-values).

## Semantic visual Save (PINI-004 / #667)

The Configuration **visual** editor Save path sends Set/Unset ops (file, section,
key, occurrence, expected previous value; Set also carries the next value) via
`ini:save-semantic`. The backend applies those ops to the **latest** read
payload under the existing INI lock — not a blind overwrite of the editor
buffer — so non-overlapping external edits can coexist. Overlapping
expected-previous mismatches fail with `INI_SEMANTIC_CONFLICT` (no silent
clobber; conflict-review UI is PINI-005). Profile/system-owned keys and
forbidden Unset policies are rejected (`INI_SEMANTIC_OWNERSHIP` /
`INI_SEMANTIC_UNSET_FORBIDDEN`). Per-row **Revert** stays draft-only against the
editor baseline. The Raw/text editor and other full-buffer writers still use
`ini:save` with fingerprints (PINI-003 / #665).

**Operator chrome:** while dirty, a fingerprint mismatch on focus shows an
**info** banner in visual mode (“INI updated outside YARK”) with a short count
of outside setting changes, a compact **View outside changes** text link that
opens a Needs-attention-style detail popover, and copy to click Save to merge
when edits do not overlap (no Reload button in that banner). Text mode keeps an
attention banner with Reload because Save will refuse until then. A failed Save
with an overlapping conflict uses a red **INI conflict** alert (Reload offered
there).

## Complex values

Loot, spawn, crafting, engram, and stat lines are parenthesized lists. `parseIniComplexEntries` in `src/shared/ini/ini-complex-value.ts` reads those assignments (PINI-010 / #680). Scalar settings stay on `parseIniTextRows` and semantic Set/Unset.

Each complex entry keeps the raw text, its source range, file, section, key, and the same zero-based occurrence as scalar Save. Status is `supported`, `unknown`, `invalid`, or `ambiguous`. A semantic value is present only when the status is `supported`. Diagnostics describe the status and do not change the entry.

`applyIniComplexEdits` with no edits returns the original text, including comments, blank lines, and line endings. An edit reprints only the adopted entry. Neighbors that are unknown, invalid, or ambiguous stay as loaded. This module does not strip client keys; that remains `stripClientIniKeys`.

Supported shape: a comma-separated struct (`Name=Value`) or a positional list, including nested tuples, quoted strings (`\"`, `\\`, `\n`, `\r`, `\t`), numbers, booleans, and bare tokens. Mixed named and positional fields are `ambiguous` and have no semantic value. A balanced shape outside that grammar is `unknown`. Unclosed parentheses, unclosed quotes, and unrecognized escapes are `invalid`.

No visual editor for these lines ships with this parser.

## Diagnostics

`diagnoseIniSettingMetaCatalog()` checks duplicate identities, unsupported enums,
stale verified provenance, and seed ↔ catalog ownership consistency. Unit tests
expect an empty diagnostic list after `catalog:ini-meta`.

## Related docs

- [server-lifecycle.md](server-lifecycle.md) — INI read/save, profile sync, pending writes
- [config-transfer.md](config-transfer.md) — selection compose and owned-key reapply
- [clusters.md](clusters.md) — cluster INI templates
- [settings.md](settings.md) — catalog rebuild note
