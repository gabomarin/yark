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

YARK-owned tokens (map URL / `-port=` / `-ServerPlatform=` / `-mods=` / cluster
trio) are always `yarkOwned`, even when the wiki marks ASA Check. See
[`launch-args.ts`](../src/backend/domains/instances/launch-args.ts).

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
