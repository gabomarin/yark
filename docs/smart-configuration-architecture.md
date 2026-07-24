# Smart Configuration — proposed architecture

Status: on-demand assistant for existing servers implemented on 2026-07-24.

## 1. Observations

- The workspace presents `Game.ini` and `GameUserSettings.ini` as primary
  destinations, even though both use the same visual editor.
- Categories are already decoupled from technical sections, but can only be
  browsed within the active file.
- Canonical defaults contain 297 settings: 191 from `GameUserSettings.ini` and
  106 from `Game.ini`.
- The catalog recognizes 296 of those 297 settings and already provides
  description, default, and type for most of them.
- Raw editing, change state, presets, search, filters, and restore already
  exist and must be preserved.

## 2. Detected problems

- A user must know which INI to search before expressing what they want to
  change.
- The same categories can appear in two tabs and force switching between files.
- Technical keys are the primary title, and many descriptions are in English or
  overly long.
- Nearly all settings share the same hierarchy, even though some are frequent
  and others are operational, dangerous, or highly specialized.
- Current presets apply several changes from a selector without explaining the
  outcome clearly enough before applying.

## 3. Proposed information architecture

Primary server navigation:

1. `Server`
2. `INI Files`
3. `Mods`

The existing experience does not disappear. `INI Files` keeps explicit
navigation between `GameUserSettings.ini` and `Game.ini`, with two modes:

- `Visual by file`: the current categorized editor.
- `Text`: the raw editing mode previously found under `Advanced`.

This preserves concepts and muscle memory for experienced administrators. The
action to open the external file remains in this view.

Beginner configuration is not a permanent tab. It opens on demand from
`Server → Configuration assistant`, because entering a tab must not imply that
browsing and applying recommendations are the same action.

The assistant is a dedicated six-step view:

1. Experience profile.
2. Progression pace via semantic levels.
3. Breeding via semantic levels.
4. World via semantic levels (capacity, density, cycle, and survival).
5. Comfort rules.
6. Review and apply.

It reads current values and creates an isolated draft. Choosing profiles,
advancing, or canceling does not write files. Only `Apply changes` validates,
previews, and saves both INI files. Keys not managed by the assistant are
preserved.

## 4. Components and flow

### Draft

- Initialized from the real INI files.
- Uses understandable concepts, not technical keys.
- Modifies only a curated catalog (~24 frequent concepts).
- Coordinates related settings through understandable presets, but always shows
  the exact multipliers each selection will produce.
- `Current` restores only the original values of the active group and keeps the
  rest of the draft.
- `Settings for one person or a small group` is an explicit high-impact
  decision. Profiles preserve it and never enable or disable it implicitly.
- When single-player mode is active, Pace and Breeding show both the configured
  multiplier and the known effective rate. Effects that cannot be reduced to a
  single rate are also warned about.
- Difficulty is a composite concept: the user chooses the common max level and
  the assistant coordinates `DifficultyOffset=1` with
  `OverrideOfficialDifficulty=level/30`. Original values are preserved while the
  user keeps `Current`.
- Discarded entirely on cancel.
- Cannot open if `INI Files` has pending changes.

### Review and save

- Presents previous and new values in human language.
- The change counter opens this same summary from any step; it is not only a
  passive indicator.
- Validates the model with Zod.
- Re-reads the INI files before applying and overlays only curated settings.
- Requests a backend preview before saving.
- Reports whether the server requires a restart.
- After applying, reloads the manual editor from disk.

### INI Files

- Keeps the current visual editor per file.
- Keeps the current raw editor as `Text` mode.
- Selector between both files and between visual/text mode.
- Path and action to open the file.
- Remains the habitual experience for experienced administrators.

## 5. Incremental implementation

### Block 3.1 — INI Files

- Group visual and raw editors under a single view.
- Preserve file selector, external open, and restore.

Status: completed.

### Block 3.2 — On-demand assistant

- Contextual launcher from `Server`.
- Five steps with profiles and current values.
- Isolated draft, readable summary, and explicit apply.
- Protection against pending manual changes.

Status: completed for existing servers.

### Block 3.3 — Curated expansion

Status: completed (2026-07-23).

- Catalog expanded with max players, density, harvest node health, day/night
  cycle, food/water drain, and structure resistance.
- New `World` step in the assistant; experience profiles declare values for
  these fields.
- Model tests cover read/write of the new settings.

### Block 3.4 — Server creation

Status: completed (2026-07-23).

- After creating a server (not when cloning), the workspace opens with an
  optional onboarding checklist.
- Checklist: experience (assistant / defaults), cluster, ports, and install.
- `Later` closes the checklist without blocking start or install.
- The INI assistant is reused; configuration logic is not duplicated.

## 6. Current decisions

- There is no permanent tab named `Guided Configuration`.
- Opening the assistant never changes the INI files.
- Profiles are draft starting points, not persisted states.
- Pace and breeding use discrete levels instead of a continuous slider: several
  multipliers change in different directions and a single numeric scale would
  hide that relationship.
- Presets are not described as official rates, because Wildcard events and
  changes can temporarily alter that reference.
- Additional single-player mode factors stay centralized and documented with the
  reference from the
  [ARK Official Community Wiki](https://ark.wiki.gg/wiki/Single_Player).
- The summary is derived from real changes; there is no second source of truth.
- Post-creation integration reuses this same INI assistant behind a separate
  onboarding checklist (cluster, ports, install).
