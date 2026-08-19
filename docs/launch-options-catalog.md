# ASA launch-options catalog (#92)

Versioned metadata for Ark Ascended dedicated-server **command-line** options.
Child of epic [#69](https://github.com/gabomarin/yark/issues/69); feeds structured
controls in [#93](https://github.com/gabomarin/yark/issues/93).

## Source of truth

Runtime reads the committed file
[`src/shared/asa-launch-options-catalog.json`](../src/shared/asa-launch-options-catalog.json)
via [`asa-launch-options-catalog.ts`](../src/shared/asa-launch-options-catalog.ts).

The wiki is **not** fetched or trusted at runtime. Regenerate offline with:

```bash
npm run catalog:launch-options
```

That script parses
[ark.wiki.gg Server configuration → Command line options](https://ark.wiki.gg/wiki/Server_configuration#Command_line_options).
The ASA column icons (`Check_mark.svg` / `Missing.png`) come from the template
field `inASA` (`Yes` / `No` / `Unknown`).

## Status rules

| Wiki `inASA` | Catalog `status` | Selectable later (#93) |
| --- | --- | --- |
| Yes (Check) | `supported` | Yes (unless YARK-owned) |
| No (Missing) | `unsupported` (ASE-only / rejected) | No — omitted from the browse modal |
| Unknown | `uncertain` | No |
| `status=deprecated` | `unsupported` | No — omitted from the browse modal |
| YARK composer token | `yarkOwned` | No |

The create/edit **Browse ASA catalog** modal lists ASA-relevant rows only
(`supported`, `uncertain`, `yarkOwned`). ASE-only `unsupported` entries remain in
the committed JSON for audit/regeneration but are not shown in the UI.

YARK-owned tokens (map URL / `-port=` / `-WinLiveMaxPlayers=` / `-mods=` / cluster trio) are always
`yarkOwned`, even when the wiki marks ASA Check. `-ServerPlatform=` is
**supported** and curated on the Launch tab (YARK still defaults to `ALL` when
unset). See [`launch-args.ts`](../src/backend/domains/instances/launch-args.ts).

## Uncertain / deprecated handling

- **Uncertain** rows stay in the catalog for audit so scrapes cannot silently
  advertise them; they are not user-selectable.
- **Deprecated** / ASA Missing rows are `unsupported` for the same reason.
- Operators may still pass unknown tokens via raw `extraArgs` (expert escape
  hatch; epic #69).

## Schema fields

Each entry includes: `token`, `valueType`, `category`, `summary`, `details`,
`description` (full cleaned text), `example`, `defaultSemantics`, `status`,
`conflicts`, `aliases`, `sources[]`, `reviewedAt`, plus wiki provenance
(`wikiAsa`, `wikiAse`, `wikiDeprecated`, `wikiSincePatch`).

Wiki HTML tables are converted into prose option lists (not dropped). Markup /
template noise is stripped; ASA/ASE facts stay in `summary` + `details`.

## UI curation for structured controls (#93)

Wiki `category` is almost always `Command line`. Structured controls live on a
dedicated Server Workspace tab **Launch** (after Mods), not inside the
Create/Edit Server form. Create starts with empty structured selections;
configure after create (Extra arguments remain available on Launch).

The Launch grid shows **all curated options in two columns**. Descriptions live
in a **tooltip on the flag name** (no inline summary, no “Show more options”).
Only `supported` entries are eligible; remaining YARK-owned tokens (map / port /
max players / mods / cluster) never appear as toggles.

Use the tab **search field** to filter curated rows by flag token, tooltip text,
or group name; groups with no matches hide until you clear the filter. Extra
arguments and the command preview stay visible while filtering (#352).

**Dependent options:** curated rows with `dependsOn` render in the same 2-column
grid immediately after their parent (chains recurse: parent → child → grandchild).
They stay disabled until every ancestor is enabled; compose skips them unless the
full chain is on. Examples: `-UseDynamicConfig` → `-CustomDynamicConfigUrl=`;
`-servergamelog` → `-servergamelogincludetribelogs` → `-ServerRCONOutputTribeLogs`.

Internal popularity (`common`) is docs/audit metadata only.

### Curated groups

| Group | Options |
| --- | --- |
| World & gameplay | `-ForceAllowCaveFlyers`, `-AutoDestroyStructures`, `-EnableIdlePlayerKick`, `-ForceRespawnDinos` (caution), `-UseDynamicConfig` (+ optional CustomDynamicConfigUrl), `-passivemods=` (Mods tab still owns `-mods=`), `-NoWildBabies` |
| Security & integrity | `-NoBattlEye`, `-exclusivejoin` (caution), dupe-log / cosmetics family (adjacent pairs) |
| Logging & messaging | game log → tribe logs → RCON tribe logs, `-culture=`, `-CustomNotificationURL=` |
| Performance & network | `-ServerPlatform=` (multi-select → `ALL`), `-GBUsageToForceRestart=`, `-nosound`, thread/net knobs |

### Not on Launch cards (Extra arguments / catalog)

Nitrado host tokens, graphics (`-d3d11`), save migration, legacy events,
`-NoDinos*` / `-NoAI`, dangerous niche flags, `?AltSaveDirectoryName=`, etc.

### Operator-warning options (e.g. `-ForceRespawnDinos`, `-exclusivejoin`)

Some flags are valid every boot but harmful if left on by accident (wild wipe on
every start, or exclusive-join with an empty allowlist file). They stay
**persistent** structured selections — not auto-cleared after start. While
enabled, the option row shows a **Caution** badge and the warning copy inline
(no separate page-level alert).

Enabled valued options (URL, ID list, number, platform multi-select) must have a
non-empty value before save/start; empty values are not emitted as `=value`
placeholders. Dependent rows can stay enabled in the draft while their parent is
off; compose and counts only treat them as on when the full `dependsOn` chain is
satisfied.
