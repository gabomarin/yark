# Visual direction — Paleo-Tech Operations

## Core idea

The interface represents advanced technology operating primitive worlds. The
identity should communicate precision, control, and ancient life without
becoming a gamer UI or copying ARK’s visual identity.

The blend is called **Paleo-Tech Operations**.

## Visual language

- **Obsidian:** canvas and primary surfaces. It should feel deep, stable, and
  restrained.
- **Cryogenic blue:** actions, selection, navigation, and technical processes.
- **Fossil amber:** attention, pending installs, updates, and elements that
  require a decision.
- **Biomass green:** health, availability, and successful operations.
- **Red:** errors and destructive actions; never used as decoration.

Semantic names are available as CSS variables:

- `--app-color-cryo`
- `--app-color-fossil`
- `--app-color-biomass`

## Current Radix palette

The base palette follows custom Radix scales. Components should prefer the
semantic `--app-color-*` tokens first; the `--ark-*` scales are reserved for
states and variants that need a specific step.

- `--ark-background`: night-blue canvas (`#0c1427`).
- `--ark-gray-2`: navigation and deepest surfaces.
- `--ark-gray-3`: panels and primary cards.
- `--ark-gray-4`: fields, hover, and inner surfaces.
- `--ark-gray-6` and `--ark-gray-7`: borders and separators.
- `--ark-gray-11`: secondary text.
- `--ark-gray-12`: primary text.
- `--ark-blue-9`: solid actions, selection, and indicators.
- `--ark-blue-10`: hover for solid actions.
- `--ark-blue-11`: interactive text and focus.
- `--ark-blue-12`: high-contrast content on blue backgrounds.

Operational containers that represent entities — such as a server row — may use
`--app-color-panel-cool` and `--app-color-panel-cool-emphasis`. These surfaces
mix obsidian and night blue to separate from the canvas without becoming gray
cards or competing with actions.

### Semantic surface scale

Workspace surfaces follow functional levels rather than per-component gray
choices:

- `--app-color-surface-chrome`: navigation, bars, and structural panels.
- `--app-color-surface-panel`: forms, editors, and content cards.
- `--app-color-surface-control`: fields and interactive headers.
- `--app-color-surface-control-hover`: control hover.
- `--app-color-border-subtle`: separation between regions.
- `--app-color-border-control`: identifiable field boundary.
- `--app-color-text-soft` and `--app-color-muted-soft`: primary and secondary
  text without pure white.

A field must be distinguishable from its panel by fill and border. At rest, the
control border holds roughly `3.10:1` against the panel; on focus it uses
interactive blue and a halo, without changing layout.

Persistent list selections use a dark surface with minimal blue tint, a soft
border, and a side indicator. Solid blue is reserved for primary actions and
must not be used as a full fill for a selected row.

Full scales `--ark-blue-1` through `--ark-blue-12`, `--ark-blue-a1` through
`--ark-blue-a12`, `--ark-gray-1` through `--ark-gray-12`, and `--ark-gray-a1`
through `--ark-gray-a12` are also available. Prefer alpha variants for
selection, hover, and focus because they preserve relationship to the
underlying surface. The renderer includes Display P3/OKLCH equivalents when the
monitor and Chromium support them.

## Motifs and shapes

- Topographic curves represent territory, strata, and exploration. Use them at
  low opacity as ambient texture, never as content.
- The Tek microtexture combines fragmented geometry, connections, nodes, and
  strata curves in a continuous `640×640` tile. It is presented visually at
  `720×720` to reduce repetition and uses a vertical mask: it nearly disappears
  behind upper content and gains presence only in empty space.
- The microtexture belongs to the canvas. Do not repeat it inside cards, forms,
  modals, tables, or side panels.
- Technical shapes may include cuts, segments, or slightly irregular geometry.
  They must not compromise readability or clickable areas.
- The side spine on server rows communicates status and recalls an organic
  structure without literally drawing bones or dinosaurs.
- The initial symbol combines biology and technology through DNA inside a
  technical cell. It is a brand direction, not the final distribution icon.

## Depth

Hierarchy is built primarily with contrast, borders, and separation. Gradients
are reserved for large ambient planes, selected navigation, and transitions
between night blue and obsidian. Do not apply them to every card or use them to
fake glow. Avoid glassmorphism and large shadows; shadows are reserved for
elements that truly float, such as modals or docks.

### Obsidian Atmosphere

- The canvas combines night blue in the upper zone with neutral obsidian in the
  work area.
- The sidebar is part of the same atmosphere and must not read as an
  independent gray column.
- Content surfaces keep neutral contrast with a minimal blue mix.
- Solid actions stay flat; gradient must not replace functional hierarchy.
- Fossil amber may appear as nearly imperceptible ambient lighting, while
  retaining its attention meaning.

## Constraints

- Do not use dinosaur illustrations as dashboard decoration.
- Do not use neon, brushed metal, fire, aggressive textures, or gamer
  typography.
- Do not fill every surface with topographic patterns.
- Do not assign colors without operational meaning.
- Do not sacrifice density, contrast, or accessibility for visual identity.

## Criteria for new components

A component belongs to this identity when:

1. It remains understandable without the decorative motif.
2. It uses color to communicate state or action.
3. It keeps flat surfaces and a clear hierarchy.
4. It introduces at most one subtle paleo-tech detail.
5. It would feel professional alongside Docker Desktop, GitHub Desktop, or
   Linear.

## Adaptive workspace

The workspace protects the work surface first. The breakpoint is chosen by the
minimum width the form and INI editors need, not by a generic device category.

- From `1600 px` up, the server list, editor, and status/actions panel appear in
  three columns.
- Below `1600 px`, the editor occupies the full available width.
- The server list is reused in a left drawer and secondary actions in a right
  drawer.
- Lifecycle actions — start, restart, and stop — remain in the header because
  they affect the server’s immediate state.
- Drawers are temporary and close when selection completes; do not add a manual
  preference when behavior can be resolved automatically and predictably.

This pattern can be reused on other screens with a central work area, as long as
displaced panels are context or secondary actions and not information required
to complete the primary task.

### Overview on wide screens

On Overview, from `1600 px` up the server list and recent activity appear in
parallel. Activity occupies a narrow sticky column; do not fill gaps with
decorative metrics. Useful content grows to roughly `2200–2400 px` to avoid dead
margins on QHD/2K.

## Dense catalog filters

Large filter collections are not represented as rows of badges or buttons. When
there are more categories than fit on one line:

- use a searchable selector next to the primary search field;
- offer only categories with results in the current context;
- each option communicates its result count;
- a selection is preserved across contexts only if it remains valid;
- vertical space is reserved for the content the user is trying to browse or
  edit.

Chips are reserved for small sets — roughly five options or fewer — when
simultaneous comparison between alternatives adds value.

## Full-height operational views

Screens meant for long-running streams — logs, consoles, jobs, or histories —
keep operational context inside the viewport:

- the header, global actions, and section navigation do not scroll with
  content;
- lists and consoles receive scroll, not the full page;
- the entire flex chain must declare `min-height: 0`; do not fake the result
  with arbitrary max heights;
- a master-detail view allows independent scroll in both regions;
- metadata and actions for the selected item remain visible;
- a panel with no data shows a deliberate, explanatory empty state.

`PageScaffold` offers `fillViewport` as opt-in behavior. Do not enable it on
documentary content pages or forms that naturally need to grow.

### Density in master-detail views

When the detail contains a console, editor, or long viewer, that content is the
primary goal and should receive most of the available height:

- the selected item’s action shares the header with the title when it needs no
  extra explanation;
- data already visible in global context is not repeated in the detail;
- two to four short metadata items are grouped in one compact strip with
  separators, instead of independent cards;
- history identifies the real artifact — for example, the file name — and does
  not repeat the server name;
- selection is communicated with a side indicator, border, and minimal color
  tint; not with a saturated block.

Compaction must not hide or truncate priority information. In narrow windows,
the strip may scroll horizontally before growing and significantly reducing the
work area.

## Blue-obsidian operational surfaces

Servers, SteamCMD, and Logs belong to the same operational environment, but must
not use identical intensity:

- server rows receive the strongest emphasis because they represent primary
  entities and their states;
- SteamCMD’s active state may use the same gradient and side indicator at
  medium intensity;
- histories, details, and consoles use a softer blue-gray mix;
- consoles keep a near-black interior for monospace readability;
- secondary technical panels do not return to pure neutral gray or receive
  independent decorative gradients.

Identity comes from coherent temperature and semantic levels, not by painting
every container blue. The user should distinguish state, action, and content
before perceiving the visual treatment.
