# Frontend Rewrite Design: Overview First

Date: 2026-07-23
Status: Draft approved for spec review
Scope: Renderer-only rewrite, preserving backend and IPC behavior

## Goal

Rebuild the renderer UI on a cleaner architectural base while preserving the existing application behavior, IPC contracts, and operating model. The first implementation cut will fully rewrite only the Overview / Servers experience. All other routes will move into the new shared shell as homogeneous placeholders until their dedicated designs are provided.

The rewrite is driven by two main issues:

1. Visual inconsistency introduced by iterative changes on top of a monolithic stylesheet and page-specific markup.
2. Layout fragility caused by shared CSS rules with overly broad selectors and no component boundaries.

## Non-Goals

The following are explicitly out of scope for this first cut:

- Backend refactors.
- IPC contract redesign.
- Full Logs / Clusters / Backups / SteamCMD / Settings implementations.
- Replacing Phosphor icons.
- Rewriting every overlay or page if it is not required to make Overview operational.

## Chosen Stack

### UI library

Mantine is the base design-system library for the rewrite.

Reasoning:

- Faster to build a cohesive internal desktop UI than a fully custom primitives layer.
- More neutral and easier to brand than Material UI for this use case.
- Less visually opinionated than Ant Design.
- Good coverage for cards, app shell, menus, badges, modals, forms, tabs, overlays, notifications, and layout primitives.

### Icon strategy

Keep `@phosphor-icons/react` for the first cut.

Reasoning:

- Avoids mixing a design-system migration with an icon migration.
- Preserves existing icon semantics already used by the application.
- Minimizes unnecessary code churn.

### Styling model

Use a layered approach:

1. Mantine theme for global design tokens and defaults.
2. Local CSS Modules for component-level customization.
3. A very small global stylesheet for reset, root sizing, base body background, and a few truly global rules.

This replaces the current monolithic `styles.css` as the primary styling mechanism.

## High-Level Architecture

The current renderer is visually centralized in `App.tsx` and a small number of large components. The new renderer architecture separates orchestration from presentation.

### Target structure

```text
src/renderer/src/
  app/
    App.tsx
    AppProviders.tsx
    AppRouter.tsx
    AppShellLayout.tsx
  layout/
    Sidebar/
      Sidebar.tsx
      Sidebar.module.css
    PageScaffold/
      PageScaffold.tsx
      PageScaffold.module.css
  features/
    overview/
      OverviewPage.tsx
      OverviewPage.module.css
      components/
        OverviewHeader.tsx
        OverviewStats.tsx
        RecentActivityPanel.tsx
        ServerGrid.tsx
    servers/
      components/
        ServerCard/
          ServerCard.tsx
          ServerCard.module.css
        ServerForm/
          ServerForm.tsx
          ServerForm.module.css
    placeholders/
      PlaceholderPage.tsx
      PlaceholderPage.module.css
  shared/
    theme/
      theme.ts
      tokens.ts
    ui/
      AppMetricCard/
      SectionCard/
      StatusBadge/
      SearchField/
      IconActionButton/
  styles/
    globals.css
```

## Application Behavior Boundary

The rewrite must preserve existing behavior.

### Keep as-is

- Electron shell.
- IPC API exposed through `window.api`.
- Polling / refresh strategy in the renderer.
- Existing action handlers for start, stop, restart, clone, delete, install, update, folder open, logs open, INI open, RCON, and SteamCMD cancellation.
- Internal route concepts: `overview`, `clusters`, `backups`, `steamcmd`, `logs`, `settings`.
- Existing derived state logic based on:
  - servers
  - statuses
  - installation info
  - cluster reports
  - recent events
  - SteamCMD status and console snapshot

### Rewrite completely

- Page markup.
- Layout components.
- Sidebar visual implementation.
- Overview composition.
- ServerCard visual implementation.
- ServerForm visual implementation if included in first cut.
- CSS architecture.

## First-Cut Functional Scope

### Fully implemented

#### 1. Shared shell

A new application shell will preserve the current conceptual layout:

- Persistent left sidebar.
- Main content region.
- Shared page header patterns.
- Scroll behavior managed by layout primitives rather than scattered CSS.

#### 2. Overview page

Overview will be rebuilt from scratch, preserving its current functional capabilities:

- Search input for servers.
- New server action.
- Top operational metrics.
- Grid of server cards.
- Recent activity panel.

#### 3. Server cards

Each server card must preserve existing operational actions and derived display information:

- Start.
- Stop.
- Restart.
- Open folder.
- Open logs.
- Open INI.
- Install server files.
- Update server.
- Clone.
- Force kill.
- Delete.
- RCON command execution.
- SteamCMD cancel when relevant.

The implementation can change visually, but the behavior must remain equivalent.

#### 4. Server form

Recommended to include in the first cut.

Reasoning:

- Overview is not truly operational if `New server` still depends on the old frontend tree.
- This is part of the main happy-path workflow.

### Placeholder-only in first cut

These routes must render inside the new shell with consistent placeholder pages:

- Clusters
- Backups
- SteamCMD
- Logs
- Settings

Each placeholder should include:

- Correct page title.
- Brief message that the page is being migrated.
- Visual consistency with the new system.
- No layout jumps or mixed old/new styling.

### Deferred

- Full Logs rewrite inside the new frontend architecture.
- Full INI editor rewrite.
- Full Clusters / Backups / SteamCMD / Settings implementations.

## Design Principles

### 1. Component boundaries first

No renderer file should act as a styling and layout dumping ground.

Rules:

- `App.tsx` becomes orchestration-first, not page-markup-first.
- Layout concerns live in layout components.
- Feature pages compose smaller pieces instead of embedding all content inline.
- Each major visual component gets its own CSS Module.

### 2. Theme-driven consistency

Spacing, colors, radius, shadows, and typography come from shared tokens first.

Rules:

- Avoid hardcoded one-off spacing values in components unless there is a documented exception.
- Use Mantine theme values for default consistency.
- Use CSS Modules for component identity, not for rebuilding a second ad-hoc design system.

### 3. Preserve layout intent, not implementation

The new app should still feel like the same product direction:

- Persistent sidebar.
- Server management as the center of the experience.
- Logs and operational tooling as first-class pages.
- Compact desktop-oriented control surfaces.

But the old DOM structure and CSS selectors are not part of the contract.

### 4. No mixed old/new UI tree for migrated surfaces

Once Overview is migrated, it should not depend on legacy page layout or legacy style classes.

The only acceptable legacy reuse is behavior logic, not visual coupling.

## Layout Design

### Sidebar

The new sidebar must preserve these responsibilities:

- Brand area.
- Primary route navigation.
- SteamCMD quick-status entry.
- Official version chip.
- App version display.

It should be implemented with Mantine layout primitives, but remain compact and optimized for desktop app usage rather than a generic web dashboard.

### Page scaffold

A reusable page scaffold should support:

- Page title and subtitle.
- Right-aligned actions.
- Optional toolbar area.
- Scrollable body region.
- Stable min-height behavior in short windows.

This directly addresses the fragility seen in the current renderer where generic flex rules created layout bugs.

## Overview Design

### Overview header

Responsibilities:

- Show page identity.
- Contain the server search input.
- Contain the `New server` action.

It should be implemented as a dedicated component rather than inline JSX inside `App.tsx`.

### Metrics row

The current top summary cards should remain conceptually similar but be rebuilt using shared metric-card primitives.

Metrics to preserve:

- Servers.
- Jugadores placeholder if still not implemented.
- Clusters.
- Backups placeholder if still not implemented.
- Updates.
- Advertencias.

Visual goals:

- More compact than current implementation.
- Consistent heights.
- Responsive wrapping without dominating the page.

### Server grid

Responsibilities:

- Render filtered server list.
- Preserve empty-state messaging.
- Use a stable responsive card grid.

The server grid should not encode per-card logic inline.

### Recent activity panel

Responsibilities:

- Show recent events.
- Preserve severity coloring semantics.
- Avoid collapsing to unusable height in short windows.

The new layout must prefer making the main page scroll rather than collapsing this panel to near-zero height.

## Server Card Design

The new card should use Mantine components as the base, but expose a product-specific surface.

Suggested composition:

- Mantine `Card` as shell.
- `Group` / `Stack` for internal structure.
- `Badge` or custom status badge wrapper for server state.
- `ActionIcon` for compact action row.
- `Menu` for overflow actions.
- Local CSS Module for visual identity.

Required content blocks:

- Server identity.
- Map / cluster / version / installation status metadata.
- Runtime state.
- Updates availability cue if relevant.
- Actions row.

Required behavior:

- Preserve exact capabilities already exposed by the current `ServerCard`.
- Do not remove operational controls in the rewrite.

## Placeholder Page Design

Placeholder pages must not feel broken or incomplete in layout terms.

Each should include:

- Page title.
- Short subtitle.
- Informational card explaining that the page will be migrated next.
- Optional note that functionality is temporarily unavailable in the rewritten frontend.

This keeps the new shell coherent while allowing phased visual delivery.

## Migration Strategy

This is a big-bang frontend architecture switch with narrow functional implementation.

Meaning:

- We do not keep old page implementations live alongside new ones for Overview.
- We do keep the backend and renderer logic model.
- We introduce the new shell and route surfaces in one consistent pass.
- Only Overview and its directly required supporting pieces become real on day one.
- The rest becomes uniform placeholders rather than carrying over old UI.

## Risk Management

### Risk 1: Big-bang switch breaks core workflows

Mitigation:

- Keep logic in place while only changing presentation structure.
- Include `ServerForm` in first cut so the core overview workflow remains usable.
- Validate all main Overview actions manually before considering the cut complete.

### Risk 2: Mantine introduces a generic look

Mitigation:

- Centralized theme tokens.
- CSS Modules for local identity.
- Keep custom sidebar and cards rather than using raw defaults everywhere.

### Risk 3: CSS migration leaves hidden coupling

Mitigation:

- Migrate Overview without depending on legacy style class names.
- Reduce legacy global stylesheet to true globals only.
- Explicitly verify migrated surfaces without old style dependencies.

### Risk 4: Scope expansion into every page

Mitigation:

- Hard boundary: only Overview is truly implemented in first cut.
- Other routes get placeholders, not partial page rewrites.

## Testing Strategy

### Automated checks

1. `cmd.exe /c "npm run typecheck"`
2. `cmd.exe /c "npm run build"`
3. `cmd.exe /c "npm test"`

### Manual checks

Overview:

- Search works.
- New server action works.
- Server cards show correct derived values.
- Main card actions work.
- Recent activity panel is visible and scrollable in short windows.
- Responsive behavior is acceptable in narrow widths.

Shell:

- Sidebar navigation works.
- Placeholder routes render inside the new layout without blank gaps or mixed styling.
- Window-height handling is stable.

## Acceptance Criteria

- New renderer uses Mantine + CSS Modules as the primary visual architecture.
- `App.tsx` no longer acts as a large inline page-rendering file for migrated surfaces.
- Sidebar is visually rewritten but functionally equivalent.
- Overview is fully usable in the new frontend.
- Non-Overview routes render homogeneous placeholders in the new shell.
- Legacy `styles.css` is no longer the main styling surface for Overview.
- No mixed old/new styling remains on migrated Overview surfaces.
- Typecheck, build, and tests pass in Windows-native verification commands.

## Recommended First Implementation Order

1. Install Mantine dependencies and set up providers/theme.
2. Create new shell and page scaffold.
3. Move non-implemented routes to placeholder pages.
4. Build Overview page structure.
5. Rewrite ServerCard.
6. Rewrite ServerForm.
7. Shrink legacy global styles and remove migrated dependencies.
8. Validate behavior and responsive layout.

## Open Decision Closed

ServerForm should be included in the first cut.

Reasoning:

Without it, the new Overview would not represent a complete primary workflow. Including it keeps the first rewritten surface operational rather than decorative.
