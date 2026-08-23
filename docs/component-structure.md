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
| **Atom** | Tiny presentational unit; little/no feature logic | `src/renderer/src/shared/ui/*` | `AppSurfaceCard`, `EmptyState`, `SearchField`, `ReadonlyPath`, `PathField`, `ConsoleSurface`, `AppMetricCard`, `ServerRuntimeStatusBadge`, `SelectableListRow`, `YarkDataTable`, `AccentIconTile` |
| **Molecule** | One reusable UI idea for a feature | `features/<area>/components/` | `ClusterMemberRow`, `ServerCardMetaItem`, `EventDetailsBody`, `MetaStrip` (Clusters) |
| **Organism** | Section that composes molecules + local state wiring | `features/<area>/components/` or `layout/` for shell | `ClusterDetailPanel`, `ServerCard`, `ServerLogsPanel`, `AppSpotlight` |
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
  <area>.module.css              # feature styles (shared by local components)
  components/                    # organisms / molecules
    <Name>/
      <Name>.tsx
      <Name>.module.css          # optional — omit if styles stay in the feature CSS
    <TinyOnce.tsx>               # flat file OK for tiny one-offs with no CSS module
  hooks/                         # React hooks owned by this feature
    useSomething.ts
  model/                         # pure helpers / view-models (no React)
    somethingModel.ts
  actions/                       # optional — confirm/IPC helpers used by hooks
    somethingActions.ts
```

App shell (`src/renderer/src/app/`):

```text
src/renderer/src/app/
  hooks/                         # useApp* shell hooks
  model/                         # pure shell helpers (overlay types, SteamCMD card maps, …)
  App*.tsx / overlays            # routers, providers, layout (may stay flat until a second wave)
```

**Rules of thumb**

- Prefer **feature-local** `hooks/` / `model/` — do **not** create a global `src/hooks/` dump.
- Organism-only hooks may stay beside the component until a second consumer appears
  (e.g. `components/ServerForm/useServerForm.ts`).
- Prefer `model/` over a vague `utils/` for feature view logic. Tiny cross-cutting
  helpers belong under `shared/`.
- Avoid a `types/` folder for a single interface — colocate with the owning model/hook.
- Precedent: `features/servers/hooks/`, `features/backups/{hooks,model,actions}/`,
  `features/logs/{hooks,model,actions}/`, `app/hooks/`, `app/model/`.

- Prefer **domain names**: `ClusterDetailPanel`, not `RightColumn`.
- One primary export per file matching the file name.
- Keep CSS modules **feature-scoped** unless the atom is in `shared/ui`.
- **Folder rule:** if a component already has (or needs) its own `.module.css`, put it in `components/<Name>/`. Do not invent a CSS module just to justify a folder when styles correctly live in the feature CSS.
- `shared/ui/<Name>/` always uses a per-component folder (tsx + optional css + helpers).
- Tests: page tests for **user flows** (leave-guard, tab switches, wizards). Prefer
  a model/unit test or a small organism mount (`SidePanel`, `WorkspaceHeader`)
  for lock flags and derived disabled state — do not remount `*Page` for that.
  Heavy UI suites: `setupUser()` from `@renderer/test/setupUser` (`delay: null`);
  use `findBy*` for appearance; keep `waitFor` only when the result is async. See [#281](https://github.com/gabomarin/yark/issues/281).
  Full `RendererApi` stubs: `createRendererApiMock()` from
  `@renderer/test/createRendererApiMock` (#354) — one factory grows when IPC
  methods are added. Prefer it when a suite already types a complete
  `RendererApi`. Leave partial stubs (e.g. ServerMods / Clusters
  `...(window.api ?? {})`) until they hit the same fan-out; then migrate with
  overrides only. Fixture timestamps/versions live as named constants on that
  module. Bare `vi.fn()` defaults resolve to `undefined` if awaited — override
  when a test asserts `IpcResult` shape. If the factory becomes unwieldy,
  consider generating stubs from `RendererApi` rather than hand-listing.

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

1. Extract **pure helpers** → `model/<area>Model.ts` (or a sibling under `model/`).
2. Extract **feature hooks** → `hooks/useSomething.ts`.
3. Extract **confirm/IPC action helpers** → `actions/` when the hook would otherwise bloat.
4. Extract **repeated row/badge** → molecule under `components/`.
5. Extract **each major card/panel** → organism.
6. Leave the page as orchestration + a short JSX tree.
7. Keep selectors (`data-*`) stable for visual/e2e scripts. If the UI change
   would break Playwright clicks, update `scripts/e2e-*.cjs` in the same PR
   ([e2e-validation.md](e2e-validation.md#ui-changes-and-e2e)).
8. Run the feature’s unit tests + `npm run typecheck`.

Reference implementation: `src/renderer/src/features/clusters/` (organisms);
folder convention examples: `features/backups/`, `features/logs/`, `app/hooks/`.

## Anti-patterns

- Copying Atomic Design folder names into every feature by rote.
- Moving feature UI into `shared/ui` “just in case”.
- God hooks that return 20 fields and the entire UI config.
- Splitting CSS into one file per 10-line component unless styles collide.

## Automated gate

`npm run lint` (Husky pre-commit/pre-push + CI) runs **ESLint 9**
(`eslint.config.mjs`: TypeScript + React hooks) after the size/Actions-pin
checks. CI also runs `npm run knip` (`knip.jsonc`) for unused files, exports,
dependencies, and unused CSS **files** — not unused classes inside a
`.module.css`. Size caps on `src/renderer/src/features/**/*.{ts,tsx}` (excluding
`*.test.*`):

- New/ungrandfathered React component files (`.tsx`) must stay ≤ **350** lines.
- New/ungrandfathered model/helper files (`.ts`) must stay ≤ **450** lines.
- Existing mega-files are listed in
  [`scripts/component-structure-baseline.json`](../scripts/component-structure-baseline.json)
  and must not grow by more than **25** lines without an intentional baseline update
  (prefer splitting instead; see
  [issue #44](https://github.com/gabomarin/yark/issues/44)).

Backend size caps on `src/backend/**/*.ts` (excluding `*.test.*`):

- New/ungrandfathered TypeScript files must stay ≤ **800** lines.
- Coordinators still above the cap are listed in
  [`scripts/backend-structure-baseline.json`](../scripts/backend-structure-baseline.json)
  with the same **25**-line growth slack. Shrink and drop rows over time
  ([#146](https://github.com/gabomarin/yark/issues/146)).

## Deferred structural migrations

Renderer feature pages that used to be grandfathered are now under the standard
caps (Phase 6). Prefer organisms + hooks when growing those surfaces again —
see [decomposition-146.md](decomposition-146.md). Backend grandfathered
coordinators should continue to shed orchestration into sibling modules until
they drop out of `backend-structure-baseline.json`.

Line caps stay in the baseline JSON files; do not raise them while deferring —
shrink the file or update the baseline intentionally when splitting.

**Cross-cutting decomposition (#146):** backend mega-services, `App.tsx`, and phased extraction order live in [decomposition-146.md](decomposition-146.md). Start there before a #146 slice PR.

## Related docs

- Design system / surfaces: [design-system.md](design-system.md)
- Shell / feature status: [agent-context.md](agent-context.md)
- Visual review after layout splits: [visual-testing.md](visual-testing.md)
- Hooks + CI: [README.md](../README.md) (Local development), [AGENTS.md](../AGENTS.md)
