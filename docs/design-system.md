# Design system (Mantine extension for YARK)

How to keep renderer UI **homogeneous** when adding or changing screens.
Complements [component-structure.md](component-structure.md) (Atomic Design file layout).

Source of truth for numeric tokens: `src/renderer/src/shared/theme/tokens.ts` → CSS vars + Mantine theme in `theme.ts`.

## Principles

1. **Surfaces** come from tokens + `AppSurfaceCard`, not copy-pasted gradients.
2. **Spacing** uses `--app-space-*` / Mantine `gap="sm"` — not one-off `10px` / `gap={6}`.
3. **Extract shared chrome on the second real use** (same rule as #44).
4. Prefer Mantine props (`radius`, `padding`, `gap`, `variant`) + CSS variables over raw hex/px.
5. Workspace “tool” chrome (`flat` / `chrome`) is intentional and different from page cool panels.

---

## UX rule categories (audit lens)

Use this checklist when reviewing a screen or introducing a pattern. Each category should have **one recipe**, not N local variants.

### 1. Surfaces / containers

| Rule | Do | Don’t |
| --- | --- | --- |
| Page panels | `AppSurfaceCard` (`cool` / `coolEmphasis`) | Local `.panel { linear-gradient(112deg…) }` |
| Nested widgets | `tone="flat"` | Mixing Card + ad-hoc panel bg |
| Shell rails | `tone="chrome"` or chrome parent + flat children | Cool gradients in sidebars |
| Status accent | `statusTone` on `AppSurfaceCard` | One-off `box-shadow: inset 3px…` |

### 2. Spacing / density

Mantine **does** have spacing tokens (`theme.spacing` → `gap="xs"` / `p="md"` / `--mantine-spacing-sm`). YARK overrides them so they match `--app-space-*`.

| Token | Comfortable (px) | Compact ≈0.82× (px) | Typical use |
| --- | ---: | ---: | --- |
| `xxs` | 4 | 3 | Label↔value, micro stacks (`gap="xxs"`) |
| `xs` | 8 | 7 | Compact Group, action button rows |
| `sm` | 12 | 10 | Default Stack inside panels, control padding |
| `md` | 16 | 13 | Section gaps, card body rhythm |
| `lg` | 20 | 16 | PageScaffold section gap / page padding-y |
| `xl` | 28 | 23 | Large empty / hero padding |

**UI density preference** (Settings → General → UI density):

| Mode | Pref key | Effect |
| --- | --- | --- |
| Compact (default) | `compact` | Spacing, radius, `fontSizes` / headings / `--app-font-page` × **0.82** from Comfortable baselines; TextInput / Select / Button / ActionIcon default to Mantine `size="xs"`; Switch / Checkbox / Radio stay at `sm` for hit targets; TextInput height/padding tightened via `[data-ui-density="compact"]` on `<html>` (covers portals) |
| Comfortable | `comfortable` | Pre-density baselines (spacing/radius as before; headings = Mantine defaults **34/26/22** + line-heights **1.3/1.35/1.4/…**; PageScaffold title **28px**); form controls keep Mantine’s prior default (`sm`) — no `size="md"` uplift |

Preference key: SQLite `app_settings.uiDensity` (IPC `app:get-ui-density` / `app:set-ui-density`). Loaded in `main.tsx` **before** the first `AppProviders` theme mount (falls back to Compact if IPC fails). Persisted only from the Settings change handler (not a mount effect — Safe under `StrictMode`). Failed saves keep the previous density and show an error notification. A legacy `localStorage` value (`settings.uiDensity`) is migrated once when the SQLite row is missing — and only cleared after a successful write.

`AppProviders` rebuilds the Mantine theme + `--app-space-*` / `--app-radius-*` / `--app-font-page` CSS vars when density changes and sets `data-ui-density` on `document.documentElement` so Modal/Drawer portals inherit compact input styles. Compact sets `defaultProps.size="xs"` on text inputs / selects / buttons (not Switch/Checkbox/Radio). Forms or icon rows that hardcode larger sizes (e.g. ServerCard ActionIcon `lg`) should follow `useUiDensity()` so Compact still shrinks them. Hardcoded feature CSS `px` values do **not** scale — snap those to tokens when you touch a file (same rule as before). Do **not** use Electron zoom / `html { zoom }` for product density.

```tsx
<Stack gap="sm">…</Stack>           // preferred in TSX
gap: var(--app-space-sm);            // preferred in CSS modules
```

**Snap off-grid leftovers** when you touch a file: `6→xs|xxs`, `10→xs|sm`, `14→sm|md`. Do not mass-rewrite unrelated CSS in the same PR.

### 3. Radius

| Token | Comfortable (px) | Compact (px) | Use |
| --- | ---: | ---: | --- |
| `--app-radius-sm` | 10 | 8 | Small chips / tight widgets |
| `--app-radius-control` | 12 | 10 | Inputs, list rows, search |
| `--app-radius-md` | 14 | 11 | Nested cards / Paper default |
| `--app-radius-lg` | 18 | 15 | Page `AppSurfaceCard` |

Avoid raw `border-radius: 8px|14px` when a token fits. Tek icon tiles keep asymmetric radius by design (`AccentIconTile shape="tek"`).

### 4. Color / status

- Semantic: `--app-color-ok|warn|attention|danger` (danger aliases bad). Use Mantine
  `color="attention"` for update / needs-attention controls (matches the server-card
  attention rail). Version status text uses theme shade refs (`c="ok.5"`, `c="attention.5"`).
- Text: `--app-color-text` / `--app-color-muted`.
- Borders: `--app-color-border` / `--app-color-border-subtle`.
- Never hardcode status hex (`#e5484d`, `#58c89a`, …) in feature CSS.

### 5. Selection / focus

- Selected rows: `SelectableListRow` → `--app-list-selected-bg` + `--app-list-selected-inset`.
- Focus rings: reuse existing `:focus-visible` patterns (ark-blue outline), don’t invent per-page rings.

### 6. Empty states

- Always `EmptyState` (`layout="inline"` | `"stacked"`).
- Domain content (incomplete clusters, etc.) nests **inside** EmptyState — don’t rebuild the shell.

### 7. Typography (still light)

| Role | Current convention |
| --- | --- |
| Page title | PageScaffold `h1` via `--app-font-page` (Comfortable **28px** / Compact ≈23px) |
| Panel title | Mantine `Title order={3|4}` |
| Meta labels | uppercase + `letter-spacing: 0.04em` (e.g. Clusters `MetaStrip`) |
| Body / muted | Mantine `Text` + `c="dimmed"` |

**Follow-up candidate:** `--app-font-meta|title` if more screens invent competing sizes (12 vs 11 meta, 18 vs 16 panel titles).

### 8. Iconography

- Phosphor icons; size usually 14–16 in actions, 20–24 in empties / hero tiles.
- Prefer `AccentIconTile` for branded tiles (ServerCard / SteamCMD / guidance).

### 9. Elevation / motion

- Panels: `--app-shadow-panel` (hairline).
- Floating / dock: `--app-shadow-elevated` (SteamCMD dock — keep feature-local behavior).
- Motion: short transitions on selection/hover only; no decorative ambient animation in tool chrome.

### 10. Interaction density

| Context | Density |
| --- | --- |
| Overview / marketing-ish empties | Comfortable (`EmptyState` inline/page) |
| Workspace tools / backup rows | Compact (`xs`/`sm`, smaller ActionIcons) |
| Page tool panels (Logs/Clusters) | Medium (`sm` stacks inside `AppSurfaceCard`) |

Don’t mix comfortable Overview padding into dense INI/backup toolbars without intent.

---

## Surface recipes

| Tone | CSS / component | Use for |
| --- | --- | --- |
| `cool` | `AppSurfaceCard` / `--app-surface-cool` | Page panels (Clusters, Logs, Backups, SteamCMD) |
| `coolEmphasis` | `AppSurfaceCard tone="coolEmphasis"` | Hero guidance / primary operation cards |
| `flat` | `tone="flat"` / `--app-surface-flat` | Nested tool cards, secondary widgets |
| `chrome` | `tone="chrome"` | Shell-adjacent asides (workspace rails) |

```tsx
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";

<AppSurfaceCard fill statusTone="error">
  …
</AppSurfaceCard>
```

## Shared atoms (start here)

| Atom | Path | Role |
| --- | --- | --- |
| `AppSurfaceCard` | `shared/ui/AppSurfaceCard/` | Homogeneous Card container |
| `EmptyState` | `shared/ui/EmptyState/` | Inline or stacked empties (`layout`) |
| `SelectableListRow` | `shared/ui/SelectableListRow/` | Selected list/row chrome |
| `AccentIconTile` | `shared/ui/AccentIconTile/` | Tek / rounded icon tiles |
| `SearchField` | `shared/ui/SearchField/` | Search inputs |
| `ServerRuntimeStatusBadge` | `shared/ui/ServerRuntimeStatusBadge/` | Process status badge |

## When adding a new page

1. Use `PageScaffold` (unless Overview / workspace shell).
2. Wrap major sections in `AppSurfaceCard` (`fill` in split panes).
3. Use `gap="sm"|…` / `--app-space-*` — no new magic px.
4. Reuse `EmptyState` / `SearchField` / `SelectableListRow` before inventing chrome.
5. Keep domain organisms under `features/<area>/components/`.

## Still feature-local (by design)

- `ServerCard` product chrome (status rail clip-path)
- SteamCMD floating dock elevation behavior
- Server workspace 3-column shell / INI editor tables
- Domain empty **content** — wrap with shared EmptyState shell
- Clusters `MetaStrip` (feature-local until a second screen needs the same strip)
- Backup all-servers `StatCard` strip (candidate for `AppMetricCard` on 2nd use)
- `AppMetricCard` unused — wire or delete in a follow-up

## Candidates for a later slice

| Candidate | Why | Trigger |
| --- | --- | --- |
| Feature CSS spacing sweep | Hundreds of hardcoded px remain | Touch file → snap to tokens |
| Type scale tokens | Meta/title sizes still ad-hoc | Third conflicting title size |
| `PageSectionHeader` | Title + filter/actions repeats | Third identical header |
| `DangerConfirmModal` pattern | Restore/delete/cleanup modals | After second modal copy-paste |
| Console surface atom | SteamCMD + Logs mono panels | When Logs viewer is extracted |
| Form section Card defaults | `ServerForm` raw Card | When editing ServerForm chrome |

## Related

- Atomic file layout: [component-structure.md](component-structure.md)
- Issue tracker: [#44](https://github.com/gabomarin/yark/issues/44)
