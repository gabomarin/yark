# DataTable adoption (#94)

Selective use of `mantine-datatable` via the shared `YarkDataTable` wrapper
(`src/renderer/src/shared/ui/YarkDataTable/`). Import styles once from
`src/renderer/src/main.tsx` (`mantine-datatable/styles.css`).

## Contract

| Concern | Expectation |
| --- | --- |
| Density | Compact / comfortable via `useUiDensity` (spacing + `fz`) |
| Empty / loading | `emptyState` slot (prefer `EmptyState`) + `fetching` |
| Selection | Library selection column when multi-select matters |
| Row actions | Keep feature `RowActionEntry` / kebab / context menu models |
| Surfaces | Align with cool/chrome tokens; avoid one-off row gradients |
| Out of scope | Cards, short lists, narrative accordions “for consistency” |

## Candidate decisions

| Surface | Decision | Notes |
| --- | --- | --- |
| **Backup history** | **Adopt** (shipped first) | Multi-select, status/type, restore/delete actions; column sort + resize |
| **INI visual grid** | Conditional / keep custom for now | Needs sticky UI-category headers + in-cell editors |
| **Fleet / server events** | **Keep** Accordion | Narrative expand (#102); poor table fit |
| **Updates job history** | Keep `SelectableListRow` master–detail for now | Optional later |
| **Mods inventory** | **Adopt** | Dual order (load order vs view sort); drag only when unsorted; thumbs + icon-only actions (context menu kept) |

## Follow-ups

- Revisit INI only if a DataTable API preserves grouping and live editors cleanly.
