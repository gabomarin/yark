# Design system (Mantine extension for YARK)

How to keep renderer UI **homogeneous** when adding or changing screens.
Complements [component-structure.md](component-structure.md) (Atomic Design file layout).

Source of truth for numeric tokens: `src/renderer/src/shared/theme/tokens.ts` → CSS vars + Mantine theme in `theme.ts`.

## Principles

1. **Prefer Mantine first.** Use Mantine components for interaction and structure
   (`Modal`, `Stepper`, `Tabs`, `Tooltip`, `Alert`, `Checkbox`, `Select`,
   `TextInput`, `Button`, `Stack`, `Group`, `Spotlight`, …) before hand-rolling the same
   widget in CSS modules. Multi-step wizards should use Mantine `Stepper`
   (`size="sm"`, `allowNextStepsSelect={false}`) like `CreateClusterModal` /
   `AddServersModal`. Shared YARK atoms (`AppSurfaceCard`, `EmptyState`,
   `PathField`, …) still win when they already define that chrome. Global jump
   navigation uses `@mantine/spotlight` (`AppSpotlight`, Ctrl+K) — do not
   invent a second quick-jump overlay.
2. **Surfaces** come from tokens + `AppSurfaceCard`, not copy-pasted gradients.
3. **Spacing** uses `--app-space-*` / Mantine `gap="sm"` — not one-off `10px` / `gap={6}`.
4. **Extract shared chrome on the second real use** (same rule as #44).
5. Prefer Mantine props (`radius`, `padding`, `gap`, `variant`) + CSS variables over raw hex/px.
6. Workspace “tool” chrome (`flat` / `chrome`) is intentional and different from page cool panels.
7. Custom CSS modules polish layout after Mantine + shared atoms are exhausted —
   they must not reimplement Mantine widgets.
8. **Mantine CSS is layered.** Entry imports `@mantine/*/styles.layer.css` (and
   datatable’s layer file) so app modules / globals sit above `@layer mantine`
   and win on equal specificity without fighting import order
   ([help.mantine.dev/q/styles-order](https://help.mantine.dev/q/styles-order)).
   Do not also import `styles.css`. **Do not override `position` on
   `AppShell.Navbar` / `AppShell.Main`** in modules — Mantine’s fixed navbar +
   main padding is load-bearing; a relative navbar pushes Main below the fold.
   Keep navbar `z-index` above Main so Main’s full-width box does not steal
   sidebar clicks.

---

## Operator-facing copy

UI strings are for the **operator** sitting at this PC. Write what they see and
why the control helps them run dedicated servers — not an inventory of wizard
steps, IPC names, or implementation.

Canonical product name: **YARK server manager**. Short identity (README /
`package.json` / getting-started): a **local Windows desktop app** that
installs, configures, operates, and recovers **ARK: Survival Ascended dedicated
servers**. It is not a game client, not a hosted service, and not “localhost”.

Prefer “server manager” / “on this PC” over “local host” (reads as localhost).

### What each thing is (use this in descriptions)

| Thing | Operator meaning |
| --- | --- |
| **YARK** | The manager app. Profiles, Start/Stop, INI, backups, RCON live here. |
| **SteamCMD** | Valve’s tool that downloads/updates **dedicated server files**. One SteamCMD home is shared across profiles. Settings shows **Needs setup** until `steamcmd.exe` is chosen or installed; the skippable assistant uses **Recommended** when the operator may continue. |
| **Default base folder** | Where **New server** creates a named subfolder. Not the SteamCMD home. |
| **Server / profile** | YARK’s record (map, ports, install path, cluster). **Create** does not download ASA files. |
| **Install files** | SteamCMD fills the shared ASA cache, then copies into that profile’s folder. Requires SteamCMD Ready. |
| **Start** | Spawns `ArkAscendedServer.exe`. Needs a **Ready** install. Enable does not. |
| **Cluster** | Shared folder + Cluster ID so survivors/items transfer between maps on this PC. |
| **Import install** | Point YARK at an ASA tree already on disk (folder that contains `ShooterGame`). |

Domain runbooks: [updates-steamcmd.md](updates-steamcmd.md),
[server-lifecycle.md](server-lifecycle.md), [clusters.md](clusters.md),
[settings.md](settings.md). Public first-run: website
[getting-started](../website/src/content/docs/docs/getting-started.mdx).

### How to write helper text

| Do | Don’t |
| --- | --- |
| One or two sentences: what it does for the operator | List every step the wizard or IPC will take |
| Match Settings when the same control exists in first-run | Invent first-run-only jargon Settings does not use |
| Name the product **server manager** when you need an identity line | “A local host for…” / localhost / “this Electron app” |
| Status words operators already see (`Ready`, `Needs setup`, `Recommended`, `Installing…`) | Internal keys (`onboarding.v1`, `detected === false`) |
| Page chrome: title + live status (`3 profiles · none running`) | A subtitle that restates the nav item (“Monitor and manage…”) |

Examples:

- SteamCMD: “Installs and updates dedicated server files. You can continue while it runs.”
- Default base folder: “New servers are created here, each in its own named subfolder.”
- Welcome: “A server manager for ARK: Survival Ascended dedicated servers on this PC.”

### Wizards

Multi-step setup (`SetupWizard`, create/import/cluster) should not dismiss on
overlay click (`closeOnClickOutside={false}`). The operator uses **Skip** /
**Close**, **Back**, or the header close — not an accidental click outside.

First-run setup also: [`.cursor/rules/setup-wizard.mdc`](../.cursor/rules/setup-wizard.mdc).

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

**UI density preference** (Settings → General → Display size):

| Mode | Pref key | Effect |
| --- | --- | --- |
| Compact (default) | `compact` | Spacing, radius, `fontSizes` / headings / `--app-font-page` × **0.82** from Comfortable baselines; TextInput / Select / Button / ActionIcon default to Mantine `size="xs"`; Switch / Checkbox / Radio stay at `sm` for hit targets; TextInput height/padding tightened via `[data-ui-density="compact"]` on `<html>` (covers portals) |
| Comfortable | `comfortable` | Pre-density baselines (spacing/radius as before; headings = Mantine defaults **34/26/22** + line-heights **1.3/1.35/1.4/…**; PageScaffold title **28px**); form controls keep Mantine’s prior default (`sm`) — no `size="md"` uplift |

Preference key: SQLite `app_settings.uiDensity` (IPC `app:get-ui-density` / `app:set-ui-density`). Loaded in `main.tsx` **before** the first `AppProviders` theme mount (falls back to Compact if IPC fails). Persisted only from the Settings change handler (not a mount effect — Safe under `StrictMode`). Failed saves keep the previous density and show an error notification. A legacy `localStorage` value (`settings.uiDensity`) is migrated once when the SQLite row is missing — and only cleared after a successful write.

`AppProviders` rebuilds the Mantine theme + `--app-space-*` / `--app-radius-*` / `--app-font-page` CSS vars when density changes and sets `data-ui-density` on `document.documentElement` so Modal/Drawer portals inherit compact input styles. Compact sets `defaultProps.size="xs"` on text inputs / selects / buttons (not Switch/Checkbox/Radio). Forms or icon rows that hardcode larger sizes (e.g. ServerCard ActionIcon `lg`) should follow `useUiDensity()` so Compact still shrinks them. **ServerCard:** primary Start/Stop/kebab stay `md` / `lg` (#233 hit targets); progress Pause/Cancel/Resume use `xs` / `sm`. Overview card **narrow-viewport stacking** is density-aware: Comfortable stacks earlier (`1100px` / `760px`); Compact keeps a denser horizontal row longer and only stacks at smaller widths (#377). Hardcoded feature CSS `px` values do **not** scale — snap those to tokens when you touch a file (same rule as before). Do **not** use Electron zoom / `html { zoom }` for product density.

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

**Square vs rounded:** Overview server **list rows** (`ServerCard`) and the Clusters **How transfers work** Accordion are square (`radius={0}`) so stacked chrome reads as one list. Nested panels keep tokens: `AppSurfaceCard` default `lg`, logs/copy Accordion and form cards `md`. Do not square those to match the Overview list.

### 4. Color / status

- Semantic: `--app-color-ok|warn|attention|danger` (danger aliases bad). Use Mantine
  `color="attention"` for update / needs-attention controls (matches the server-card
  attention rail).   Use `color="fossil"` for unsaved-leave alerts (same amber as
  `--app-color-fossil` / warn). Restart **filled** uses **`--app-color-fossil-filled`**
  (richer amber; alerts keep base fossil).   **`color="red"`** maps to **`--app-color-bad`** for **filled** delete/remove
  commits and **`--app-color-danger-bright`** for menu danger rows, Stop
  (`variant="light"`), and icons on dark chrome — not Mantine’s default coral. Version status text uses
  theme shade refs (`c="ok.5"`, `c="attention.5"`).
- **Inline Alert surfaces** (theme `Alert` `--alert-bg` / `--alert-bd`): `blue` =
  translucent blue wash; `yellow` / `fossil` / `attention` = translucent panel
  (`bg-card/60` recipe) + fossil border; `red` = translucent danger wash.
- Text: `--app-color-text` / `--app-color-muted`.
- Borders: `--app-color-border` / `--app-color-border-subtle`.
- Never hardcode status hex (`#e5484d`, `#58c89a`, …) in feature CSS.

### 5. Selection / focus

- Selected rows: `SelectableListRow` → `--app-list-selected-bg` + `--app-list-selected-inset`.
  Feature list rows that cannot use `SelectableListRow` still bind those two vars (no
  one-off `inset 3px` / local selection gradients).
- Focus rings: reuse existing `:focus-visible` patterns (ark-blue outline), don’t invent per-page rings.

### 5b. Page-local job status (toolbar cohesion)

When a page action starts a longer job (e.g. Overview **Check Servers Health**),
put progress **on the initiating control** (Mantine `Button` `loading` + busy label).
Do **not** add a second status chip beside the button or a window-fixed top overlay.
Secondary badges (attention counts, etc.) stay for outcomes — not a second
“scanning…” primary.

### 5c. Operator feedback channels

| Channel | Use for |
| --- | --- |
| **Toast** (`notifications.show`, **bottom-right**) | Completed / failed / cancelled **operator actions** that do not need to stay on screen (Check Servers Health summary, Check server updates, SteamCMD install/update/verify, backup CRUD, prefs save fail, move-install success, copy-configuration success, INI save/discard, Logs export/clear/delete, log-retention cleanup). Bottom-right avoids covering Overview/workspace toolbars. |
| **Inline Alert** | **State that remains true** (files locked while updating, server running, wizard warnings, port conflicts, move leftover-folder decision, INI last-saved diff) or confirm-modal decision context |
| **Panel / dock** | Long-running or multi-item work (Downloads queue / footer teaser, stop progress, fleet backup alerts, Overview attention list) |
| **Global AppShell banner** | Optional shell prop kept for rare app-wide hard failures; **App does not use it** for per-action IPC — prefer `showOperatorToast` / `showOperatorError` (`shared/ui/operatorToast.ts`) |

Manual **Check Servers Health** ends with a toast (attention count or “all healthy”); startup **server** health scan stays silent. Quiet **YARK app** update check (~60s) toasts only when an update is available or ready to install (sidebar accent remains). SteamCMD job outcomes, `runAction` failures, and Backups page save/cleanup results use toasts, not page or AppShell banners.

### 5d. Destructive actions (inline controls)

Primary destructive **Button**s use **`color="red" variant="filled"`** — **Stop**, **Force close**, labeled Remove/Delete, Ban, cancel in-flight jobs (expanded SteamCMD dock Cancel, backup toolbar Delete). Dense **icon-only** row/list **ActionIcon**s prefer **`variant="subtle"`** (keep `color` for meaning: red delete, orange restore, teal resume, yellow pause) so a column of fills does not dominate the row — backups history, cluster members, logs clear/delete, Downloads queue, minimized SteamCMD Cancel (#397). Workspace **server list** (full or icon rail) is switch-and-select only; **Add server** / **Import** live on Overview (#397). **Restart** uses **`color="fossil" variant="filled"`** in the workspace lifecycle row and Overview card (warm amber, same weight as Stop). Theme **`autoContrast: true`** uses dark label/icon on light filled colors (fossil, attention). Kebab **Stop safely** / **Force close** / **Delete** use `Menu.Item color="red"`; **Restart** uses `color="fossil"`.

| Surface | Recipe |
| --- | --- |
| Lifecycle **Restart** | `color="fossil" variant="filled"` |
| Inline destructive **Button** (Stop, Force close, delete/remove) | `color="red" variant="filled"` |
| Kebab danger **Menu.Item** | `color="red"` (inherits `--app-color-danger-bright`) |
| Dense **ActionIcon** (delete/remove and secondary row icons) | Prefer `variant="subtle"` with semantic `color` (#397); use **`filled`** only for labeled destructive **Button**s |

| Confirm modals | `confirmProps: { color: "red" }` (Mantine default `filled`) |

**Exceptions (not red filled):** red **Alert** / **Badge** (error state, not actions); **menu** row actions (`serverCardMenuActions`, backup/mods context menus — separate pass); **Remove from YARK** (profile-only delete) keeps default primary styling; discard/unsaved-leave flows use **fossil** or default buttons.

Reference: `ServerModDetailDrawer` Remove footer (#344); quiet row icons (#397).

### 6. Dense operational tables

Prefer shared `YarkDataTable` (`shared/ui/YarkDataTable`, wraps `mantine-datatable`) for dense
lists that need selection, sort/filter chrome, or consistent empty/loading — not for cards,
accordions, or short semantic lists. Honor compact/comfortable via `useUiDensity`. See
[datatable.md](datatable.md) for adopt/keep decisions (#94). **Mods** uses dual order: column
sort is a temporary view; drag-to-reorder load order is enabled only while unsorted.

### 7. Empty states

- Always `EmptyState` (`layout="inline"` | `"stacked"`).
- Domain content (incomplete clusters, etc.) nests **inside** EmptyState — don’t rebuild the shell.

### 8. Typography (still light)

| Role | Current convention |
| --- | --- |
| Page title | PageScaffold `h1` via `--app-font-page` (Comfortable **28px** / Compact ≈23px) |
| Panel title | Mantine `Title order={3|4}` |
| Meta labels | Clusters `MetaStrip` (uppercase + tracking); server-card meta is sentence case |
| Body / muted | Mantine `Text` + `c="dimmed"` |

**Follow-up candidate:** `--app-font-meta|title` if more screens invent competing sizes (12 vs 11 meta, 18 vs 16 panel titles).

### 9. Iconography

- Phosphor icons; size usually 14–16 in actions, 20–24 in empties / hero tiles.
- Prefer `AccentIconTile` for branded tiles (ServerCard / SteamCMD / guidance).

### 10. Elevation / motion

- Panels: `--app-shadow-panel` (hairline).
- Floating / dock: `--app-shadow-elevated` (Downloads footer teaser — keep feature-local behavior).
- Motion: short transitions on selection/hover only; no decorative ambient animation in tool chrome.

### 11. Interaction density

| Context | Density |
| --- | --- |
| Overview / marketing-ish empties | Comfortable (`EmptyState` inline/page) |
| Workspace tools / backup rows | Compact (`xs`/`sm`, smaller ActionIcons) |
| Page tool panels (Logs/Clusters) | Medium (`sm` stacks inside `AppSurfaceCard`) |

Don’t mix comfortable Overview padding into dense INI/backup toolbars without intent.

**Servers layout:** **Recent activity** is a wide-only side panel (`min-width: 1600px`). Below that breakpoint, hide the stacked panel so the server list keeps the viewport; keep a compact **View logs** link (Logs nav remains available).

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
| `RowActionMenu` | `shared/ui/RowActionMenu/` | Shared kebab + context-menu action model (`RowActionEntry`) |
| `SelectableListRow` | `shared/ui/SelectableListRow/` | Selected list/row chrome |
| `AccentIconTile` | `shared/ui/AccentIconTile/` | Tek / rounded icon tiles |
| `MapArtThumb` | `shared/ui/MapArtThumb/` | ASA map artwork thumb (list + header) |
| `SearchField` | `shared/ui/SearchField/` | Search inputs — see **SearchField variants** below |
| `ServerRuntimeStatusBadge` | `shared/ui/ServerRuntimeStatusBadge/` | Process status badge |
| `ReadonlyPath` | `shared/ui/ReadonlyPath/` | Bordered monospace chip for configured filesystem paths |
| `PathField` | `shared/ui/PathField/` | Read-only path chip + Browse/Clear actions |
| `ConsoleSurface` | `shared/ui/ConsoleSurface/` | ScrollArea monospace console for SteamCMD / Logs (plain text, stick-to-bottom) |
| `AppMetricCard` | `shared/ui/AppMetricCard/` | Compact scalar metric tile (fleet strips; optional RingProgress) |

### SearchField variants

One visual control for “find something in this list.” Do **not** wire a raw
`TextInput` + `MagnifyingGlass` for search.

| Variant | When | How |
| --- | --- | --- |
| **Filter** (default) | Instant local list filter (Overview, Launch, Logs, INI, backups, catalog) | `SearchField` alone; decorative left magnifier; `label` for aria-only name; `size` `xs` (rail / Compact) or `sm` (Comfortable). Never `md`. |
| **Submit** | Remote or explicit search (Mods Discover CurseForge) | `SearchField` with `onSubmit` — flush end-cap ActionIcon in `rightSection` (+ Enter), same panel/border/text chrome as Select. Do **not** add a separate trailing Button, and do not turn Mods into instant-as-you-type filter. |

`label` vs `fieldLabel`: use `label` when the placeholder / context already names
the control (Overview, INI filter bar, Mods Discover). Use `fieldLabel` when a visible Mantine
caption is required.

## Product brand / packaging icons

Canonical sources live under [`brand/`](../brand/) — see [`brand/README.md`](../brand/README.md).

| Asset | Role |
| --- | --- |
| `brand/yark-logo.png` | Full lockup → website hero; sidebar uses a 336px-wide export |
| `brand/yark-icon.png` | Mark → `build/icon.ico`, web favicons, app tab favicon |
| `brand/yark-logo.svg` | Optional local design source only (gitignored; not runtime) |

Rebuild wired copies after editing sources:

```bash
npm i --no-save sharp png-to-ico
node brand/_build-icons.cjs
```

Electron packaging reads `build/icon.ico` (`package.json` → `build.win.icon` /
`extraResources`). The BrowserWindow resolves the same ICO via `resolveAppIcon()`
in `src/main/index.ts`.

## When adding a new page

1. Use `PageScaffold` (unless Overview / workspace shell).
2. Wrap major sections in `AppSurfaceCard` (`fill` in split panes).
3. Use `gap="sm"|…` / `--app-space-*` — no new magic px.
4. Reuse `EmptyState` / `SearchField` / `SelectableListRow` / `ReadonlyPath` /
   `PathField` before inventing chrome.
5. Keep domain organisms under `features/<area>/components/`.

### Filesystem paths

Operators should recognize filesystem paths the same way everywhere:

| Need | Use |
| --- | --- |
| Configured / known path (Settings, confirm dialogs, resolved previews) | `ReadonlyPath` — bordered monospace chip; pass `emptyLabel` for unset |
| Editable path + folder picker | `PathField` — Settings-style `ReadonlyPath` chip + Browse (+ optional Clear); no keyboard editing |

Do **not** use Mantine `Code`, ad-hoc `ff="monospace"`, or a private Browse row for
filesystem paths. `PathField` matches Settings (chip + Browse/Clear); values never
edit via keyboard. Streaming log / SteamCMD consoles use `ConsoleSurface`; INI
editors stay feature-local monospace (not path chips). Map tokens and other
non-path identifiers may stay monospace `Text` (not `ReadonlyPath`).

**Exception:** Settings SteamCMD keeps a hand-rolled `ReadonlyPath` + Choose… +
**Install SteamCMD** row (not `PathField`) so the install CTA stays on the same
line (#234).

## Still feature-local (by design)

- `ServerCard` product chrome (square list rows, straight status rail; stopped keeps a faint fill + accent rail so it does not scan as Inactive)
- Downloads queue / footer teaser elevation
- Settings SteamCMD path row (`ReadonlyPath` + Choose… + Install CTA; not `PathField`)
- Server workspace 3-column shell / INI editor tables
- Domain empty **content** — wrap with shared EmptyState shell
- Clusters `MetaStrip` (feature-local until a second screen needs the same strip)
- Backup volume detail cards (multi-line destination/disk copy; scalar strip uses `AppMetricCard`)

### Log / activity expand patterns (#102)

| Surface | Decision |
| --- | --- |
| Server Logs events / Fleet Logs | Mantine **Accordion** (`variant="separated"`, controlled, `keepMounted={false}`) |
| Overview recent activity | Mantine **Timeline** (chronological; no expand) |
| Event detail body | Shared `EventDetailsBody` inside Accordion.Panel |

### Row context menus (#105)

| Choice | Decision |
| --- | --- |
| Shell | Same Mantine **`Menu` / `Menu.Dropdown`** as kebabs (cursor-anchored via `RowActionMenuProvider`) |
| Why | One chrome for the same actions; avoids a second popup theme |
| Sync model | Shared `RowActionEntry[]` + `RowActionMenuItems` for kebab and right-click |
| Surfaces | Server cards, backup history rows, mods table rows |
| A11y | Server cards: kebab + **Shift+F10** / ContextMenu key on the focused card (`aria-haspopup="menu"`). Backup/mods table rows: row kebab / action icons remain the keyboard path (DataTable rows stay mouse-context only) |

## Candidates for a later slice

| Candidate | Why | Trigger |
| --- | --- | --- |
| Feature CSS spacing sweep | Hundreds of hardcoded px remain | Touch file → snap to tokens |
| Type scale tokens | Meta/title sizes still ad-hoc | Third conflicting title size |
| `PageSectionHeader` | Title + filter/actions repeats | Third identical header |
| `DangerConfirmModal` pattern | Restore/delete/cleanup modals | After second modal copy-paste |
| Form section Card defaults | ServerForm create/edit uses `AppSurfaceCard` | Revisit only if a new form invents local Card chrome |
| React Compiler | Spike deferred for v0.9 (#209) — current memo/`handlersRef` patterns cover Overview fan-out; revisit after Babel/Vite cost is measured | Explicit compile-time memo budget / regression |

## Related

- Atomic file layout: [component-structure.md](component-structure.md)
- Operator-facing copy: [Operator-facing copy](#operator-facing-copy)
- Issue tracker: [#44](https://github.com/gabomarin/yark/issues/44)
