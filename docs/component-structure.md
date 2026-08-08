# Component structure (Atomic Design for YARK / Cursor)

Guidance for **agents and humans** when creating or growing React UI in
`src/renderer`. Goal: keep files readable, diffs reviewable, and ownership clear
without inventing a parallel design-system bureaucracy.

## Why this exists

Large page files (hundreds of lines of JSX + helpers) are hard for agents to
edit safely and for humans to review. Prefer **compose small pieces** that match
how the product already organizes features (`features/<area>/…`).

## Atomic Design — mapped to this repo

We use Brad Frost’s vocabulary **pragmatically**. Do **not** create global
`atoms/` / `molecules/` folders at repo root unless a piece is truly shared
across features. Prefer feature-local composition.

| Level | Meaning here | Where it lives | Examples |
| --- | --- | --- | --- |
| **Atom** | Tiny presentational unit; little/no feature logic | `src/renderer/src/shared/ui/*` | `AppSurfaceCard`, `EmptyState`, `SearchField`, `ReadonlyPath`, `PathField`, `ConsoleSurface`, `AppMetricCard`, `ServerRuntimeStatusBadge`, `SelectableListRow`, `AccentIconTile` |
| **Molecule** | One reusable UI idea for a feature | `features/<area>/components/` | `ClusterMemberRow`, `ServerCardMetaItem`, `EventDetailsBody`, `MetaStrip` (Clusters) |
| **Organism** | Section that composes molecules + local state wiring | `features/<area>/components/` | `ClusterDetailPanel`, `ServerCard`, `ServerLogsPanel` |
| **Template / Page** | Route-level layout + data props from `App` | `features/<area>/<Name>Page.tsx` | `ClustersPage`, `LogsPage`, `BackupsPage` |

Shared shell pieces (`PageScaffold`, `Sidebar`) stay under `layout/` / `app/`.

## When to split (agent checklist)

Split when **any** of these is true:

1. The page/component file is **>~250–300 lines** or has **3+ distinct visual sections**.
2. The same block of JSX appears **twice** (or will), e.g. member row in empty + detail.
3. Pure helpers (formatting, grouping, sorting) mix with JSX — move to
   `<area>Model.ts` / `*ViewModel.ts` next to the page.
4. A section has its own loading/empty/error story.
5. You are about to edit one section and the file forces you to re-read unrelated UI.

**Do not** split when:

- The piece is **&lt; ~40 lines** and used once with no clear name.
- Splitting would only create a prop-drilling wrapper with no reuse.
- You would invent abstract names (`DataBox`, `ItemThing`) instead of domain names.

## File / naming conventions

```text
src/renderer/src/features/<area>/
  <Area>Page.tsx                 # page: compose organisms, own top-level state
  <Area>Page.test.tsx            # page-level behavior tests
  <area>Model.ts                 # pure helpers + derived view data (no React)
  <area>.module.css              # feature styles (shared by local components)
  components/
    <Name>/                      # prefer a folder when the piece has its own CSS (or tests)
      <Name>.tsx
      <Name>.module.css          # optional — omit if styles stay in the feature CSS
    <TinyOnce.tsx>               # flat file OK for tiny one-offs with no CSS module
```

- Prefer **domain names**: `ClusterDetailPanel`, not `RightColumn`.
- One primary export per file matching the file name.
- Keep CSS modules **feature-scoped** unless the atom is in `shared/ui`.
- **Folder rule:** if a component already has (or needs) its own `.module.css`, put it in `components/<Name>/`. Do not invent a CSS module just to justify a folder when styles correctly live in the feature CSS.
- `shared/ui/<Name>/` always uses a per-component folder (tsx + optional css + helpers).
- Tests: page tests for user flows; add component tests only for non-trivial
  molecules/organisms.

## Page responsibilities

A `*Page.tsx` should mostly:

1. Accept data/callbacks from `App` / router.
2. Derive view-model pieces (via model helpers or thin hooks).
3. Compose organisms inside `PageScaffold` (or the feature’s shell).

It should **not** embed long lists of mapped rows, multi-block empty states, and
detail panels inline when those can be named organisms.

## Prop design

- Pass **narrow props** (what the child needs), not the whole page props object.
- Callbacks stay at the page/`App` boundary (`onOpenServer`, `onRefresh`).
- Avoid deep context for one-off page composition.

## Refactor recipe (for agents)

When asked to “simplify” or when hitting the split checklist:

1. Extract **pure helpers** → `<area>Model.ts`.
2. Extract **repeated row/badge** → molecule under `components/`.
3. Extract **each major card/panel** → organism.
4. Leave the page as orchestration + a short JSX tree.
5. Keep selectors (`data-*`) stable for visual/e2e scripts.
6. Run the feature’s unit tests + `npm run typecheck`.

Reference implementation: `src/renderer/src/features/clusters/`.

## Anti-patterns

- Copying Atomic Design folder names into every feature by rote.
- Moving feature UI into `shared/ui` “just in case”.
- God hooks that return 20 fields and the entire UI config.
- Splitting CSS into one file per 10-line component unless styles collide.

## Automated gate

`npm run lint` (Husky pre-commit/pre-push + CI) enforces soft size
caps on `src/renderer/src/features/**/*.{ts,tsx}` (excluding `*.test.*`):

- New/ungrandfathered React component files (`.tsx`) must stay ≤ **350** lines.
- New/ungrandfathered model/helper files (`.ts`) must stay ≤ **450** lines.
- Existing mega-files are listed in
  [`scripts/component-structure-baseline.json`](../scripts/component-structure-baseline.json)
  and must not grow by more than **25** lines without an intentional baseline update
  (prefer splitting instead; see
  [issue #44](https://github.com/gabomarin/yark/issues/44)).

## Deferred structural migrations

These files remain **grandfathered** in the baseline. Using shared atoms
(`AppSurfaceCard`, `EmptyState`, …) or moving into a `components/<Name>/` folder
is **not** a structural split. Future #44 slices should extract along the
boundaries below (one area per PR when practical).

| File (baseline path) | Future extraction boundary |
| --- | --- |
| `features/backups/BackupsPage.tsx` | All-servers health strip / volume cards; per-server policy expand panel; cleanup + disk-alert modals |
| `features/backups/ServerBackupPanel.tsx` | Kind settings block; backup list toolbar; backup row molecule; restore/delete confirm flows |
| `features/logs/ServerLogsPanel.tsx` | Event list + event detail; update-job history/detail; log-file viewer pane |
| `features/server-workspace/components/ConfigurationEditor/ConfigurationEditor.tsx` | Filter bar; INI section/group accordion; setting row editor controls |
| `features/server-workspace/components/ConfigurationWizard/ConfigurationWizard.tsx` | Per-step panels (experience / rates / structure); change-summary review step |

Line caps stay in [`component-structure-baseline.json`](../scripts/component-structure-baseline.json); do not raise them while deferring — shrink the file or update the baseline intentionally when splitting.

## Related docs

- Design system / surfaces: [design-system.md](design-system.md)
- Shell / feature status: [agent-context.md](agent-context.md)
- Visual review after layout splits: [visual-testing.md](visual-testing.md)
- Hooks + CI: [README.md](../README.md) (Local development), [AGENTS.md](../AGENTS.md)
