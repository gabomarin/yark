import { createTheme, type CSSVariablesResolver, type MantineThemeOverride } from "@mantine/core";
import {
  appTokens as defaultAppTokens,
  type AppThemePalette,
  type AppTokens,
  type UiDensity,
  getAppTokensForTheme,
} from "./tokens";
import { DEFAULT_APP_THEME, type AppTheme } from "./themes";
import { createFluentComponents } from "./recipes/fluent";
import { createPlasmaBreezeComponents, plasmaBreezeVariantColorsResolver } from "./recipes/plasmaBreeze";

export { alertToneForColor } from "./recipes/alertTone";

/**
 * Palette steps for one theme (#PUX-004 Track B). The `--app-*` role map below
 * stays shared: only the palette it points at changes per theme.
 */
function buildRadixCssVariables(palette: AppThemePalette): Record<string, string> {
  return Object.fromEntries([
    ...palette.blue.map((value, index) => [`--ark-blue-${index + 1}`, value]),
    ...palette.blueAlpha.map((value, index) => [`--ark-blue-a${index + 1}`, value]),
    ...palette.gray.map((value, index) => [`--ark-gray-${index + 1}`, value]),
    ...palette.grayAlpha.map((value, index) => [`--ark-gray-a${index + 1}`, value]),
    ["--ark-blue-contrast", palette.blueContrast],
    ["--ark-blue-surface", palette.blueSurface],
    ["--ark-blue-indicator", palette.blue[8]],
    ["--ark-blue-track", palette.blue[8]],
    ["--ark-gray-contrast", palette.grayContrast],
    ["--ark-gray-surface", palette.graySurface],
    ["--ark-gray-indicator", palette.gray[8]],
    ["--ark-gray-track", palette.gray[8]],
    ["--ark-background", palette.background],
  ]);
}

function createAppCssVariablesResolver(
  tokens: AppTokens = defaultAppTokens,
  theme: AppTheme = DEFAULT_APP_THEME,
): CSSVariablesResolver {
  return () => ({
    variables: {
      ...buildRadixCssVariables(theme.palette),
      "--app-color-bg": "var(--ark-background)",
      "--app-color-surface-chrome": "var(--ark-gray-2)",
      /*
       * Shell atmosphere. Opaque families ship `none` (a warm wash read yellowish
       * over Fluent chrome). A family can set a cool radial in `materials`.
       */
      "--app-shell-glow": "rgba(255, 255, 255, 0.055)",
      "--app-shell-atmosphere": theme.materials.shellAtmosphere,
      /*
       * Brand, not theme: the logo lockup is a dark-navy mark with a light
       * wordmark, so the light theme backs it with this plate instead of leaving
       * it to disappear into a near-white sidebar.
       */
      "--app-brand-plate": "#0d1526",
      "--app-color-surface-panel": "var(--ark-gray-3)",
      "--app-color-surface-control": "var(--ark-gray-5)",
      "--app-color-surface-control-hover": "var(--ark-gray-6)",
      "--app-color-surface-alert": theme.surfaces.alert,
      "--app-color-border-subtle": theme.materials.borderSubtle,
      "--app-color-border-control": theme.materials.borderControl,
      "--app-color-text-soft": "var(--ark-gray-12)",
      "--app-color-muted-soft": "var(--ark-gray-11)",
      "--app-color-bg-accent": "var(--app-color-surface-chrome)",
      "--app-color-panel": theme.materials.panelBg,
      "--app-color-panel-alt": theme.materials.panelAltBg,
      "--app-color-panel-cool": theme.materials.panelBg,
      "--app-color-panel-cool-emphasis": theme.materials.panelBg,
      "--app-color-border": theme.materials.border,
      "--app-color-text": "var(--app-color-text-soft)",
      "--app-color-muted": "var(--app-color-muted-soft)",
      "--app-color-accent": "var(--ark-blue-9)",
      /* Accent role set — one hue, its states. See `accentPalette` for the source. */
      "--app-color-accent-hover": "var(--ark-blue-10)",
      "--app-color-accent-text": "var(--ark-blue-11)",
      "--app-color-accent-subtle": "var(--ark-blue-a3)",
      "--app-color-accent-subtle-hover": "var(--ark-blue-a4)",
      "--app-color-accent-contrast": "#ffffff",
      /* One brand-coloured focus ring for the whole app (alpha so it reads on any surface). */
      "--app-color-focus-ring": "var(--ark-blue-a8)",
      /* Informational state reported by the server — deliberately NOT the accent. */
      "--app-color-info": "var(--app-color-cryo)",
      /* Aliases so Downloads / feature CSS color-mix can paint (Slice 1). */
      "--app-color-primary": "var(--app-color-accent)",
      "--app-color-accent-deep": "var(--ark-blue-3)",
      "--app-color-panel-raised": theme.materials.panelRaisedBg,
      "--app-color-ok": theme.colors.ok,
      "--app-color-warn": theme.colors.warn,
      "--app-color-attention": theme.colors.attention,
      "--app-color-bad": theme.colors.bad,
      "--app-color-danger": "var(--app-color-bad)",
      "--app-color-danger-bright": theme.colors.dangerBright,
      "--app-color-cryo": "var(--ark-blue-11)",
      "--app-color-biomass": theme.colors.biomass,
      "--app-color-fossil": theme.colors.fossil,
      "--app-color-fossil-filled": theme.colors.fossilFilled,
      "--app-radius-sm": `${tokens.radius.sm}px`,
      "--app-radius-md": `${tokens.radius.md}px`,
      "--app-radius-lg": `${tokens.radius.lg}px`,
      "--app-radius-control": `${tokens.radius.control}px`,
      "--app-space-xxs": `${tokens.spacing.xxs}px`,
      "--app-space-xs": `${tokens.spacing.xs}px`,
      "--app-space-sm": `${tokens.spacing.sm}px`,
      "--app-space-md": `${tokens.spacing.md}px`,
      "--app-space-lg": `${tokens.spacing.lg}px`,
      "--app-space-xl": `${tokens.spacing.xl}px`,
      /*
       * Fluent 2 motion (#PUX-004): use these instead of ad-hoc durations and
       * `ease`. `fast` for hover/press feedback, `base` for reveals, `slow` for
       * layout changes. Ease is the Fluent standard curve.
       */
      "--app-motion-fast": "150ms",
      "--app-motion-base": "200ms",
      "--app-motion-slow": "300ms",
      "--app-ease-standard": "cubic-bezier(0.33, 0, 0.67, 1)",
      "--app-ease-decelerate": "cubic-bezier(0.1, 0.9, 0.2, 1)",
      "--app-form-description-size": `${tokens.formDescription}px`,
      "--app-form-label-size": `${tokens.formLabel}px`,
      "--app-font-page": `${tokens.pageTitle}px`,
      "--app-font-title-lg": `${tokens.titleLg}px`,
      "--app-font-title-md": `${tokens.titleMd}px`,
      "--app-font-title-sm": `${tokens.titleSm}px`,
      "--app-font-eyebrow": `${tokens.eyebrowSize}px`,
      "--app-font-display": theme.typography.display,
      "--app-font-mono": theme.typography.mono,
      "--app-shadow-panel": theme.shadows.panel,
      /* Fluent 2 elevation ladder: 2 (chip/badge) - 4 (card in flow) - 8 (menu) -
       * 16 (flyout/popover) - 28 (dock/dialog over content). Two layers each. */
      "--app-elevation-2": theme.shadows.elevation2,
      "--app-elevation-4": theme.shadows.elevation4,
      "--app-elevation-8": theme.shadows.elevation8,
      "--app-elevation-16": theme.shadows.elevation16,
      "--app-elevation-28": theme.shadows.elevation28,
      /* Shared surface recipes — prefer AppSurfaceCard / these vars over copy-pasted gradients */
      "--app-surface-border": "var(--app-color-border)",
      "--app-surface-cool": "none",
      "--app-surface-cool-emphasis": "none",
      "--app-surface-flat": "var(--app-color-panel)",
      "--app-surface-chrome": theme.materials.surfaceChromeBg,
      /*
       * Material roles. Copied from `theme.materials` for every family — do not
       * branch these on family id. Opaque families ship `none` / `transparent`.
       */
      "--app-surface-filter": theme.materials.surfaceFilter,
      "--app-surface-chrome-filter": theme.materials.chromeFilter,
      "--app-shell-chrome-bg": theme.materials.chromeBg,
      "--app-surface-raised-filter": theme.materials.raisedFilter,
      "--app-content-pane-bg": theme.materials.contentPaneBg,
      "--app-content-pane-border": theme.materials.contentPaneBorder,
      "--app-content-pane-shadow": theme.materials.contentPaneShadow,
      "--app-content-pane-radius": theme.materials.contentPaneRadius,
      "--app-panel-radius": theme.materials.panelRadius,
      "--app-tab-attached-radius": theme.materials.tabAttachedRadius,
      "--app-metric-gap": theme.materials.metricGap,
      "--app-collection-gap": theme.materials.collectionGap,
      "--app-collection-radius": theme.materials.collectionRadius,
      "--app-collection-join": theme.materials.collectionJoin,
      "--app-collection-fuse": theme.materials.collectionFuse,
      "--app-collection-item-border": theme.materials.collectionItemBorder,
      "--app-collection-strip-fill": theme.materials.collectionStripFill,
      "--app-collection-item-shadow": theme.materials.collectionItemShadow,
      "--app-content-pane-padding": theme.materials.contentPanePadding,
      "--app-shell-grain-opacity": theme.materials.shellGrainOpacity,
      "--app-chrome-border": theme.materials.chromeBorder,
      "--app-nav-selected-border": theme.materials.navSelectedBorder,
      "--app-nav-selected-shadow": theme.materials.navSelectedShadow,
      "--app-surface-hover": theme.materials.surfaceHover,
      "--app-split-gap": theme.materials.splitGap,
      "--app-split-padding": theme.materials.splitPadding,
      "--app-split-rail-border": theme.materials.splitRailBorder,
      "--app-split-rail-shadow": theme.materials.splitRailShadow,
      "--app-split-panel-max": theme.materials.splitPanelMax,
      "--app-split-panel-margin": theme.materials.splitPanelMargin,
      "--app-setting-stack-border": theme.materials.settingStackBorder,
      "--app-setting-stack-bg": theme.materials.settingStackBg,
      "--app-setting-stack-clip": theme.materials.settingStackClip,
      "--app-setting-row-bg": theme.materials.settingRowBg,
      "--app-setting-row-border": theme.materials.settingRowBorder,
      "--app-setting-row-join": theme.materials.settingRowJoin,
      "--app-setting-row-edge": theme.materials.settingRowEdge,
      "--app-sidebar-edge": theme.materials.sidebarEdge,
      "--app-sidebar-edge-glow": theme.materials.sidebarEdgeGlow,
      "--app-sidebar-footer-border": theme.materials.sidebarFooterBorder,
      "--app-sidebar-footer-margin": theme.materials.sidebarFooterMargin,
      "--app-sidebar-footer-padding": theme.materials.sidebarFooterPadding,
      "--app-sidebar-footer-radius": theme.materials.sidebarFooterRadius,
      "--app-sidebar-footer-bg": theme.materials.sidebarFooterBg,
      "--app-sidebar-footer-filter": theme.materials.sidebarFooterFilter,
      "--app-version-chip-padding-top": theme.materials.versionChipPaddingTop,
      "--app-brand-light-padding": theme.materials.brandLightPadding,
      "--app-brand-light-radius": theme.materials.brandLightRadius,
      "--app-brand-light-flex": theme.materials.brandLightFlex,
      "--app-input-well-bg": theme.materials.inputWellBg,
      "--app-menu-bg": theme.materials.menuBg,
      "--app-attention-light": theme.materials.attentionLight,
      "--app-attention-light-hover": theme.materials.attentionLightHover,
      "--app-icon-button-bg": theme.materials.iconButtonBg,
      "--app-icon-button-border": theme.materials.iconButtonBorder,
      "--app-icon-button-default-bg": theme.materials.iconButtonDefaultBg,
      "--app-icon-button-default-border": theme.materials.iconButtonDefaultBorder,
      "--app-icon-button-filter": theme.materials.iconButtonFilter,
      "--app-icon-button-shadow": theme.materials.iconButtonShadow,
      "--app-primary-button-bg": theme.materials.primaryButtonBg,
      "--app-primary-button-hover": theme.materials.primaryButtonHover,
      "--app-primary-button-border": theme.materials.primaryButtonBorder,
      "--app-button-disabled-bg": theme.materials.buttonDisabledBg,
      "--app-button-disabled-quiet-bg": theme.materials.buttonDisabledQuietBg,
      "--app-nav-link-color": theme.materials.navLinkColor,
      "--app-list-vessel-border": theme.materials.listVesselBorder,
      "--app-list-vessel-bg": theme.materials.listVesselBg,
      "--app-list-vessel-shadow": theme.materials.listVesselShadow,
      "--app-list-row-border": theme.materials.listRowBorder,
      "--app-list-row-join": theme.materials.listRowJoin,
      "--app-list-row-edge": theme.materials.listRowEdge,
      "--app-list-row-hover": theme.materials.listRowHover,
      "--app-table-head-bg": theme.materials.tableHeadBg,
      "--app-queue-section-padding": theme.materials.queueSectionPadding,
      "--app-queue-group-gap": theme.materials.queueGroupGap,
      "--app-queue-group-rule": theme.materials.queueGroupRule,
      "--app-queue-row-hover": theme.materials.queueRowHover,
      "--app-server-list-hover": theme.materials.serverListHover,
      "--app-server-list-selected-border": theme.materials.serverListSelectedBorder,
      "--app-shell-main-bg": theme.materials.shellMainBg,
      "--app-panel-surface-bg": theme.materials.panelBg,
      "--app-color-list-row": theme.materials.listRowBg,
      "--app-nav-selected-fill": theme.materials.navSelectedFill,
      "--app-nav-selected-notch": theme.materials.navSelectedNotch,
      "--app-raised-surface-bg": theme.materials.raisedBg,
      "--app-raised-surface-border": theme.materials.raisedBorder,
      "--app-raised-surface-shadow": theme.materials.raisedShadow,
      "--app-list-selected-bg": theme.materials.listSelectedBg,
      "--app-list-selected-inset": theme.materials.listSelectedInset,
      "--app-anchor-color": "var(--ark-blue-11)",
      "--app-anchor-hover-color": "var(--ark-blue-12)",
    },
    light: {
      /*
       * Same role remaps as the dark map, on Mantine's light-scheme keys: the
       * neutral family is `gray-*` there (`dark-*` is inert), and `body` stays the
       * app panel so Paper / Modal / Popover / datatable surfaces do not fall back
       * to Mantine's default white.
       */
      "--mantine-color-body": "var(--app-color-surface-panel)",
      "--mantine-color-text": "var(--app-color-text)",
      "--mantine-color-dimmed": "var(--app-color-muted)",
      /*
       * Disabled and placeholder states come from our own ramp. Mantine's light
       * defaults are its own grey (a disabled label lands around 2:1 on a near-white
       * panel), which is where a light theme usually loses "is this disabled or
       * missing?". `--ark-gray-10` keeps them perceptible without reading as enabled.
       */
      "--mantine-color-disabled": "var(--ark-gray-4)",
      "--mantine-color-disabled-color": "var(--ark-gray-10)",
      "--mantine-color-disabled-border": "var(--ark-gray-6)",
      "--mantine-color-placeholder": "var(--ark-gray-10)",
      "--mantine-color-gray-0": "var(--app-color-bg)",
      "--mantine-color-gray-1": "var(--app-color-surface-chrome)",
      "--mantine-color-gray-2": "var(--app-color-surface-panel)",
      /*
       * `gray-3` is what Mantine paints an *off* Switch track with. A panel step
       * disappears into the row it sits on (1.07:1), which reads as "disabled"
       * rather than "off", so it takes a control fill here.
       */
      "--mantine-color-gray-3": "var(--app-color-surface-control)",
      "--mantine-color-gray-4": "var(--app-color-surface-control)",
      "--mantine-color-gray-5": "var(--app-color-surface-control-hover)",
      "--mantine-color-gray-6": "var(--app-color-border-subtle)",
      "--mantine-color-gray-7": "var(--app-color-border-control)",
      "--mantine-color-gray-8": "var(--ark-gray-9)",
      "--mantine-color-gray-9": "var(--ark-gray-10)",
      "--mantine-color-default": "var(--app-color-surface-control)",
      "--mantine-color-default-hover": "var(--app-color-surface-control-hover)",
      "--mantine-color-default-border": "var(--app-color-border-control)",
      "--mantine-color-default-color": "var(--app-color-text)",
      "--mantine-color-blue-0": "var(--ark-blue-1)",
      "--mantine-color-blue-1": "var(--ark-blue-2)",
      "--mantine-color-blue-2": "var(--ark-blue-3)",
      "--mantine-color-blue-3": "var(--ark-blue-4)",
      "--mantine-color-blue-4": "var(--ark-blue-5)",
      "--mantine-color-blue-5": "var(--ark-blue-6)",
      "--mantine-color-blue-6": "var(--ark-blue-8)",
      "--mantine-color-blue-7": "var(--ark-blue-9)",
      "--mantine-color-blue-8": "var(--ark-blue-10)",
      "--mantine-color-blue-9": "var(--ark-blue-12)",
      "--mantine-color-blue-text": "var(--mantine-color-blue-filled)",
      "--mantine-primary-color-filled": "var(--ark-blue-9)",
      "--mantine-primary-color-filled-hover": "var(--ark-blue-10)",
      "--mantine-primary-color-light": "var(--ark-blue-a3)",
      "--mantine-primary-color-light-hover": "var(--ark-blue-a4)",
      "--mantine-primary-color-light-color": "var(--ark-blue-11)",
      "--mantine-color-blue-filled": "var(--ark-blue-9)",
      "--mantine-color-blue-filled-hover": "var(--ark-blue-10)",
      "--mantine-color-blue-light": "var(--ark-blue-a3)",
      "--mantine-color-blue-light-hover": "var(--ark-blue-a4)",
      "--mantine-color-blue-light-color": "var(--ark-blue-11)",
      "--mantine-color-red-filled": "var(--app-color-bad)",
      "--mantine-color-red-filled-hover": "color-mix(in srgb, var(--app-color-bad) 88%, black)",
      "--mantine-color-red-light": "color-mix(in srgb, var(--app-color-danger-bright) 14%, transparent)",
      "--mantine-color-red-light-hover": "color-mix(in srgb, var(--app-color-danger-bright) 22%, transparent)",
      "--mantine-color-red-light-color": "var(--app-color-danger-bright)",
      "--mantine-color-red-text": "var(--app-color-danger-bright)",
      "--mantine-color-red-6": "var(--app-color-danger-bright)",
      "--mantine-color-attention-filled": "var(--app-color-attention)",
      "--mantine-color-attention-filled-hover": "color-mix(in srgb, var(--app-color-attention) 88%, black)",
      "--mantine-color-attention-light": "var(--app-attention-light)",
      "--mantine-color-attention-light-hover": "var(--app-attention-light-hover)",
      "--mantine-color-attention-light-color": "var(--app-color-attention)",
      "--mantine-color-fossil-filled": "var(--app-color-fossil-filled)",
      "--mantine-color-fossil-filled-hover": "color-mix(in srgb, var(--app-color-fossil-filled) 88%, black)",
      "--mantine-color-fossil-light": "color-mix(in srgb, var(--app-color-fossil) 14%, transparent)",
      "--mantine-color-fossil-light-hover": "color-mix(in srgb, var(--app-color-fossil) 22%, transparent)",
      "--mantine-color-fossil-light-color": "var(--app-color-fossil)",
    },
    dark: {
      /*
       * Mantine's own dark default for `--mantine-color-body` is `dark-7` (a panel),
       * and Paper / Modal content / Popover / datatable all inherit from it. Keep it
       * on the panel surface, not the page canvas: the document and AppShell canvas
       * are set explicitly in `globals.css` / `AppShellLayout`, so pointing this at
       * `--app-color-bg` only made every dialog surface render darker than the app.
       */
      "--mantine-color-body": "var(--app-color-surface-panel)",
      "--mantine-color-text": "var(--app-color-text)",
      "--mantine-color-dimmed": "var(--app-color-muted)",
      "--mantine-color-dark-0": "var(--app-color-text)",
      "--mantine-color-dark-1": "var(--app-color-muted)",
      "--mantine-color-dark-2": "var(--ark-gray-10)",
      "--mantine-color-dark-3": "var(--ark-gray-8)",
      "--mantine-color-dark-4": "var(--ark-gray-7)",
      "--mantine-color-dark-5": "var(--ark-gray-6)",
      "--mantine-color-dark-6": "var(--app-color-surface-control)",
      "--mantine-color-dark-7": "var(--app-color-surface-panel)",
      "--mantine-color-dark-8": "var(--app-color-surface-chrome)",
      "--mantine-color-dark-9": "var(--app-color-bg)",
      /*
       * Disabled controls: without this, Mantine falls back to `dark-4` (our
       * `--ark-gray-7`), which on a dark row is a *bright* pill - a disabled Switch
       * read louder than an enabled one. A step above the row fill keeps it visible
       * and clearly out of play, and matches the light map's disabled remap.
       */
      "--mantine-color-disabled": "var(--ark-gray-6)",
      "--mantine-color-disabled-color": "var(--ark-gray-10)",
      "--mantine-color-disabled-border": "var(--ark-gray-7)",
      /*
       * Mantine's `default` variant (outlined buttons, badges, popovers) otherwise
       * keeps Mantine's own mapping — including a hardcoded `white` label. Derive
       * the whole set from the palette so it stays correct if surfaces lighten.
       */
      "--mantine-color-default": "var(--app-color-surface-control)",
      "--mantine-color-default-hover": "var(--app-color-surface-control-hover)",
      "--mantine-color-default-border": "var(--app-color-border-control)",
      "--mantine-color-default-color": "var(--app-color-text)",
      "--mantine-color-blue-0": "var(--ark-blue-12)",
      "--mantine-color-blue-1": "var(--ark-blue-11)",
      "--mantine-color-blue-2": "var(--ark-blue-8)",
      "--mantine-color-blue-3": "var(--ark-blue-7)",
      "--mantine-color-blue-4": "var(--ark-blue-6)",
      "--mantine-color-blue-5": "var(--ark-blue-9)",
      "--mantine-color-blue-6": "var(--ark-blue-10)",
      "--mantine-color-blue-7": "var(--ark-blue-5)",
      "--mantine-color-blue-8": "var(--ark-blue-3)",
      "--mantine-color-blue-9": "var(--ark-blue-1)",
      /* Mantine dark default maps blue-text → blue-4; filled buttons use blue-filled (= ark-blue-9). */
      "--mantine-color-blue-text": "var(--mantine-color-blue-filled)",
      "--mantine-primary-color-filled": "var(--ark-blue-9)",
      "--mantine-primary-color-filled-hover": "var(--ark-blue-10)",
      "--mantine-primary-color-light": "var(--ark-blue-a3)",
      "--mantine-primary-color-light-hover": "var(--ark-blue-a4)",
      "--mantine-primary-color-light-color": "var(--ark-blue-11)",
      "--mantine-color-blue-filled": "var(--ark-blue-9)",
      "--mantine-color-blue-filled-hover": "var(--ark-blue-10)",
      "--mantine-color-blue-light": "var(--ark-blue-a3)",
      "--mantine-color-blue-light-hover": "var(--ark-blue-a4)",
      "--mantine-color-blue-light-color": "var(--ark-blue-11)",
      "--mantine-color-red-filled": "var(--app-color-bad)",
      "--mantine-color-red-filled-hover": "color-mix(in srgb, var(--app-color-bad) 88%, white)",
      "--mantine-color-red-light": "color-mix(in srgb, var(--app-color-danger-bright) 22%, transparent)",
      "--mantine-color-red-light-hover": "color-mix(in srgb, var(--app-color-danger-bright) 32%, transparent)",
      "--mantine-color-red-light-color": "var(--app-color-danger-bright)",
      "--mantine-color-red-text": "var(--app-color-danger-bright)",
      "--mantine-color-red-6": "var(--app-color-danger-bright)",
      "--mantine-color-attention-filled": "var(--app-color-attention)",
      "--mantine-color-attention-filled-hover": "color-mix(in srgb, var(--app-color-attention) 82%, white)",
      "--mantine-color-attention-light": "var(--app-attention-light)",
      "--mantine-color-attention-light-hover": "var(--app-attention-light-hover)",
      "--mantine-color-attention-light-color": "var(--app-color-attention)",
      "--mantine-color-fossil-filled": "var(--app-color-fossil-filled)",
      "--mantine-color-fossil-filled-hover": "color-mix(in srgb, var(--app-color-fossil-filled) 82%, white)",
      "--mantine-color-fossil-light": "color-mix(in srgb, var(--app-color-fossil) 22%, transparent)",
      "--mantine-color-fossil-light-hover": "color-mix(in srgb, var(--app-color-fossil) 32%, transparent)",
      "--mantine-color-fossil-light-color": "var(--app-color-fossil)",
    },
  });
}

/**
 * Builds the shared semantic Mantine theme plus the selected component recipe set.
 * The recipe set boundary lives on AppTheme, so a family can replace component
 * chrome without changing semantic roles or CSS variable resolution.
 */
function createAppTheme(
  tokens: AppTokens = defaultAppTokens,
  density: UiDensity = "comfortable",
  theme: AppTheme = DEFAULT_APP_THEME,
): MantineThemeOverride {
  const isBreeze = theme.recipeSet === "plasma-breeze";
  const components = isBreeze ? createPlasmaBreezeComponents(density, theme) : createFluentComponents(density, theme);

  return createTheme({
    /*
     * Plasma Breeze keeps the exact KDE accent, which Mantine's WCAG autoContrast
     * reads as "light" and would label black. Only Breeze sets a resolver: passing
     * `undefined` explicitly would overwrite Mantine's default and crash components.
     */
    ...(isBreeze ? { variantColorResolver: plasmaBreezeVariantColorsResolver } : {}),
    primaryColor: "blue",
    primaryShade: 5,
    /** Dark text on light filled colors (fossil Restart, attention); white on red/teal filled. */
    autoContrast: true,
    fontFamily: theme.typography.body,
    fontFamilyMonospace: theme.typography.mono,
    defaultRadius: "sm",
    /** Aligns `gap="xs"|…` / `p="md"` with `--app-space-*` (overrides Mantine defaults). */
    spacing: {
      xxs: `${tokens.spacing.xxs}px`,
      xs: `${tokens.spacing.xs}px`,
      sm: `${tokens.spacing.sm}px`,
      md: `${tokens.spacing.md}px`,
      lg: `${tokens.spacing.lg}px`,
      xl: `${tokens.spacing.xl}px`,
    },
    radius: {
      sm: `${tokens.radius.sm}px`,
      md: `${tokens.radius.md}px`,
      lg: `${tokens.radius.lg}px`,
    },
    fontSizes: {
      xs: `${tokens.fontSizes.xs}px`,
      sm: `${tokens.fontSizes.sm}px`,
      md: `${tokens.fontSizes.md}px`,
      lg: `${tokens.fontSizes.lg}px`,
      xl: `${tokens.fontSizes.xl}px`,
    },
    /** Fluent 2 elevation scale: `shadow="xs"|…|"xl"` resolves onto the same ladder. */
    shadows: {
      xs: theme.shadows.elevation2,
      sm: theme.shadows.elevation4,
      md: theme.shadows.elevation8,
      lg: theme.shadows.elevation16,
      xl: theme.shadows.elevation28,
    },
    headings: {
      /** Family-level heading weight; Fluent's profile keeps Mantine's 700. */
      fontWeight: String(theme.typography.headingWeight),
      sizes: {
        /** Line-heights match Mantine DEFAULT_THEME (Comfortable = prior look). */
        h1: { fontSize: `${tokens.headings.h1}px`, lineHeight: "1.3" },
        /* h2-h6 are the section-title ramp so `Title order` and the atoms agree. */
        h2: { fontSize: `${tokens.titleLg}px`, lineHeight: "1.35" },
        h3: { fontSize: `${tokens.titleLg}px`, lineHeight: "1.4" },
        h4: { fontSize: `${tokens.titleMd}px`, lineHeight: "1.45" },
        h5: { fontSize: `${tokens.titleSm}px`, lineHeight: "1.5" },
        h6: { fontSize: `${tokens.headings.h6}px`, lineHeight: "1.5" },
      },
    },
    colors: {
      blue: [
        theme.palette.blue[11],
        theme.palette.blue[10],
        theme.palette.blue[7],
        theme.palette.blue[6],
        theme.palette.blue[5],
        theme.palette.blue[8],
        theme.palette.blue[9],
        theme.palette.blue[4],
        theme.palette.blue[2],
        theme.palette.blue[0],
      ],
      /** Same ladder as fossil — needs-attention is amber, not lime (#470). */
      attention: theme.ladders.attention,
      /** Index 5 = filled Restart; index 4 = base fossil for alerts/light. */
      fossil: theme.ladders.fossil,
      /** Matches `--app-color-ok` (current / healthy). */
      ok: theme.ladders.ok,
      /** Matches `--app-color-bad` / danger (destructive filled buttons). */
      red: theme.ladders.red,
      dark: [
        theme.palette.gray[11],
        theme.palette.gray[10],
        theme.palette.gray[9],
        theme.palette.gray[7],
        theme.palette.gray[6],
        theme.palette.gray[5],
        theme.palette.gray[3],
        theme.palette.gray[2],
        theme.palette.gray[1],
        theme.palette.gray[0],
      ],
    },
    components,
  });
}

export function createAppThemeForAppearance(appearance: AppTheme, density: UiDensity): MantineThemeOverride {
  return createAppTheme(getAppTokensForTheme(density, appearance.radius), density, appearance);
}

export function createAppCssVariablesResolverForAppearance(
  appearance: AppTheme,
  density: UiDensity,
): CSSVariablesResolver {
  return createAppCssVariablesResolver(getAppTokensForTheme(density, appearance.radius), appearance);
}

/** Default theme + density: the shipped dark shell. */
export function createAppThemeForDensity(density: UiDensity): MantineThemeOverride {
  return createAppThemeForAppearance(DEFAULT_APP_THEME, density);
}

export function createAppCssVariablesResolverForDensity(density: UiDensity): CSSVariablesResolver {
  return createAppCssVariablesResolverForAppearance(DEFAULT_APP_THEME, density);
}
