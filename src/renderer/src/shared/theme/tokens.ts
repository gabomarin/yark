import type { UiDensity } from "@shared/settings/ui-density";
import { BOOTSTRAP_BACKGROUND, bootstrapBackgroundFor } from "@shared/app-chrome";

export type { UiDensity } from "@shared/settings/ui-density";

/**
 * The single accent source for the **dark** theme (#PUX-004). Everything
 * accent-shaped derives from it: the `--ark-blue-*` Radix-style steps + alphas,
 * Mantine's `blue` scale, and the `--app-color-accent*` role tokens.
 *
 * Each theme's palette carries its own accent (`darkPalette.blue` /
 * `lightPalette.blue`), so a second theme swaps it as data.
 *
 * Step 9 is the solid accent, 10 the hover, 11 the text/icon tone.
 */
const accentPalette = {
  steps: [
    "#061232",
    "#06143c",
    "#081f61",
    "#122c6f",
    "#1d387c",
    "#274489",
    "#335197",
    "#4160a8",
    "#3b8cff",
    "#5ca0ff",
    "#90b5ff",
    "#cde2ff",
  ],
  alpha: [
    "#0000ff0d",
    "#0014fe19",
    "#003cfe45",
    "#1e5cff55",
    "#376ffd65",
    "#477eff74",
    "#5789fe85",
    "#6493fe99",
    "#6e9bffa8",
    "#6394ff96",
    "#90b5ff",
    "#cde2ff",
  ],
} as const;

/** Light accent: solid step 9 clears AA with a white label (5.0:1), step 11 is the text tone. */
const lightAccentPalette = {
  steps: [
    "#e9f3ff",
    "#d9ebff",
    "#bfe1ff",
    "#a2d4ff",
    "#86c4ff",
    "#6db4ff",
    "#4b9cff",
    "#2981f4",
    "#0067dd",
    "#0058c7",
    "#0042a2",
    "#002563",
  ],
  alpha: [
    "#0067dd0a",
    "#0067dd12",
    "#0067dd24",
    "#0067dd33",
    "#0067dd42",
    "#0067dd52",
    "#0067dd66",
    "#0067dd80",
    "#0067dd99",
    "#0067dd8c",
    "#0067ddcc",
    "#0067ddf2",
  ],
} as const;

export const darkPalette = {
  /* Shared with the main process so the splash/BrowserWindow canvas cannot drift. */
  background: BOOTSTRAP_BACKGROUND,
  blue: accentPalette.steps,
  blueAlpha: accentPalette.alpha,
  /**
   * Tinted dark ramp from the approved `#10407d` surface pick (darkness 0.65,
   * intensity 0.55, hue 257). Radix semantics: 1 app background (darkest) ->
   * 12 high-contrast text (lightest). Re-generate with the preview tooling
   * rather than hand-editing: the steps have to stay on one ladder.
   */
  gray: [
    "#05080e",
    "#0b111a",
    "#131e2c",
    "#1b283a",
    "#233349",
    "#2c3e57",
    "#4c607b",
    "#5c7599",
    "#6e88ac",
    "#7f98bb",
    "#aabedb",
    "#e6effd",
  ],
  grayAlpha: [
    "#00000000",
    "#f2f2ff13",
    "#ffffff1f",
    "#f9f9ff29",
    "#ffffff30",
    "#f7f7ff3b",
    "#fcfcff49",
    "#fafaff61",
    "#fdfdff6f",
    "#fdfdff7c",
    "#fefeffb5",
    "#fdfdfff0",
  ],
  /*
   * Contrast and surface steps that are not part of the ramps. They live on the
   * palette so a theme really is "one entry plus its palette": a light theme
   * needs its own values here instead of inheriting dark-oriented ones.
   */
  blueContrast: "#ffffff",
  blueSurface: "#01145180",
  grayContrast: "#ffffff",
  graySurface: "rgba(0, 0, 0, 0.05)",
} as const;

/**
 * Light palette (#PUX-004 B3). Same hue as the dark ramp (257) with a minimal
 * chroma, inverted direction: 1 is the lightest (app background) and 12 the
 * darkest (high-contrast text).
 *
 * Surfaces stay near-white and the separation comes from a light hairline plus
 * the elevation ladder, not from a visible grey step: a light theme that leans
 * on grey fills with hard borders reads like a 9x-era dialog. The canvas is the
 * one clearly grey surface (`background`), so the shell reads as a window behind
 * near-white content.
 *
 * Measured against the contract: text 13.8-14.7:1 on chrome/panel/control, muted
 * 6.6-7.2:1, accent solid 4.26:1 as a control on the panel, accent text 7.6:1,
 * white label on the solid accent 5.0:1 (the dark theme's documented 3.29:1 gap
 * is closed here), canvas/chrome 1.2:1, chrome/panel 1.04:1 and border/panel
 * 1.31:1 (the light floors, documented in theme.contrast.test.ts).
 */
export const lightPalette = {
  background: bootstrapBackgroundFor("light"),
  blue: lightAccentPalette.steps,
  blueAlpha: lightAccentPalette.alpha,
  gray: [
    "#f6f9fd",
    "#f2f5f9",
    "#eaedf1",
    "#e3e6ea",
    "#dbdee2",
    "#d4d7db",
    "#cbced2",
    "#bbbec2",
    "#9c9fa2",
    "#84868a",
    "#4b4d50",
    "#191b1d",
  ],
  grayAlpha: [
    "#0a0f1a00",
    "#0a0f1a05",
    "#0a0f1a0a",
    "#0a0f1a0f",
    "#0a0f1a17",
    "#0a0f1a1f",
    "#0a0f1a29",
    "#0a0f1a38",
    "#0a0f1a4d",
    "#0a0f1a66",
    "#0a0f1a9e",
    "#0a0f1ae6",
  ],
  blueContrast: "#ffffff",
  blueSurface: "#006be224",
  /* Labels sit on the *solid* gray steps, which are dark in this ramp: a white one
     would be invisible. This is the one contrast value that inverts with the ramp. */
  grayContrast: "#1a1c1f",
  graySurface: "rgba(0, 0, 0, 0.04)",
} as const;

/** One 12-step Radix ramp. A tuple, so indexing yields `string` and not `string | undefined`. */
export type AppThemeRamp = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/** Palette shape a theme registry entry carries (`shared/theme/themes.ts`). */
export type AppThemePalette = {
  background: string;
  blue: AppThemeRamp;
  blueAlpha: AppThemeRamp;
  gray: AppThemeRamp;
  grayAlpha: AppThemeRamp;
  blueContrast: string;
  blueSurface: string;
  grayContrast: string;
  graySurface: string;
};

/** Compact ≈ Chromium zoom-out ×2 (~80–85%). */
export const UI_DENSITY_COMPACT_SCALE = 0.82;

const comfortableSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
} as const;

const comfortableRadius = {
  sm: 4,
  md: 8,
  lg: 10,
  /** Inputs, list rows, search, chips - Fluent's 4px component radius. */
  control: 4,
} as const;

/** Mantine default fontSizes; Compact scales these the same as spacing. */
const comfortableFontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
} as const;

/**
 * Pre-density Mantine heading sizes (DEFAULT_THEME). Comfortable must match these
 * so the preference does not shrink titles vs the prior product look.
 */
const comfortableHeadings = {
  h1: 34,
  h2: 26,
  h3: 22,
  h4: 18,
  h5: 16,
  h6: 14,
} as const;

/** PageScaffold page title (not Mantine `Title` / headings.h1). */
const comfortablePageTitle = 28;

function scalePx(value: number, factor: number): number {
  return Math.max(1, Math.round(value * factor));
}

function scaleRecord<T extends Record<string, number>>(source: T, factor: number): { [K in keyof T]: number } {
  const out = {} as { [K in keyof T]: number };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const value = source[key];
    out[key] = scalePx(value as number, factor);
  }
  return out;
}

/**
 * Semantic single hexes per theme. The role map paints `--app-color-ok` and
 * friends from these, so each theme brings values that clear AA as text on its
 * own panel instead of inheriting the other scheme's tones.
 */
export type AppThemeColors = {
  ok: string;
  warn: string;
  attention: string;
  /** Filled/destructive base — clears 3:1 as a fill, not a text tone. */
  bad: string;
  /** Text-safe danger (menus, Stop, icons). */
  dangerBright: string;
  biomass: string;
  fossil: string;
  /** Richer amber for the Restart `filled` button. */
  fossilFilled: string;
};

export const darkColors: AppThemeColors = {
  ok: "#58c89a",
  warn: "#f2c94c",
  attention: "#f2c94c",
  bad: "#C94040",
  dangerBright: "#DE6A6A",
  biomass: "#58c89a",
  fossil: "#d9a85f",
  fossilFilled: "#C2610A",
};

/** Light semantics: every text tone clears 4.5:1 on the light panel (`bad` 4.1:1 as a fill). */
export const lightColors: AppThemeColors = {
  ok: "#166f49",
  warn: "#806200",
  attention: "#806200",
  bad: "#C94040",
  dangerBright: "#b3261e",
  biomass: "#166f49",
  fossil: "#8a5a12",
  fossilFilled: "#C2610A",
};

export type AppThemeSurfaces = {
  /** Alert / InfoBar base fill, before the severity tint. */
  alert: string;
};

export const darkSurfaces: AppThemeSurfaces = {
  /*
   * Built from the hull steps (2 and 12 are not plate steps), so it stays neutral
   * when the plates are warm or tinted, and it sits above both the chrome shell and
   * the panel cards - the two backgrounds an alert actually lands on. Fluent keeps
   * an info bar quiet: the tone belongs on the border and icon, never on the fill.
   */
  alert: "color-mix(in srgb, var(--ark-gray-2) 82%, var(--ark-gray-12))",
};

/** Light: near-white base, so the 12% severity tint lands as a light warm bar (Fluent's InfoBar). */
export const lightSurfaces: AppThemeSurfaces = {
  alert: "var(--ark-gray-1)",
};

export type AppThemeShadows = {
  panel: string;
  elevation2: string;
  elevation4: string;
  elevation8: string;
  elevation16: string;
  elevation28: string;
};

export const darkShadows: AppThemeShadows = {
  panel: "0 1px 0 rgba(255, 255, 255, 0.06)",
  /*
   * Fluent 2 elevation scale: two layers per level (an ambient spread plus a key
   * offset shadow). The number is Fluent's depth in px, so the ladder stays
   * traceable to the spec. Alphas are tuned for the dark app surface.
   */
  elevation2: "0 0 2px rgba(0, 0, 0, 0.28), 0 1px 2px rgba(0, 0, 0, 0.32)",
  elevation4: "0 0 2px rgba(0, 0, 0, 0.28), 0 2px 4px rgba(0, 0, 0, 0.34)",
  elevation8: "0 0 2px rgba(0, 0, 0, 0.3), 0 4px 8px rgba(0, 0, 0, 0.38)",
  elevation16: "0 0 4px rgba(0, 0, 0, 0.3), 0 8px 16px rgba(0, 0, 0, 0.42)",
  elevation28: "0 0 8px rgba(0, 0, 0, 0.3), 0 14px 28px rgba(0, 0, 0, 0.46)",
};

/** Light shadows: a dark hairline instead of the white highlight, and lighter alphas. */
export const lightShadows: AppThemeShadows = {
  panel: "0 1px 0 rgba(16, 24, 40, 0.05)",
  /* The light surfaces sit within a few percent of each other, so the elevation
   * ladder - not the fill - is what separates a card from the pane behind it. */
  elevation2: "0 0 2px rgba(16, 24, 40, 0.08), 0 1px 2px rgba(16, 24, 40, 0.1)",
  elevation4: "0 0 2px rgba(16, 24, 40, 0.08), 0 2px 4px rgba(16, 24, 40, 0.12)",
  elevation8: "0 0 2px rgba(16, 24, 40, 0.1), 0 4px 8px rgba(16, 24, 40, 0.14)",
  elevation16: "0 0 4px rgba(16, 24, 40, 0.1), 0 8px 16px rgba(16, 24, 40, 0.16)",
  elevation28: "0 0 8px rgba(16, 24, 40, 0.1), 0 14px 28px rgba(16, 24, 40, 0.18)",
};

const sharedColors = {
  bg: darkPalette.background,
  bgAccent: darkPalette.gray[1],
  panel: darkPalette.gray[2],
  panelAlt: darkPalette.gray[3],
  /** Hairline between page / panel / control — a solid step of the active ramp. */
  border: darkPalette.gray[6],
  text: darkPalette.gray[11],
  /** Helper / Mantine `c="dimmed"` — Radix step 11 of the active neutral ramp. */
  muted: darkPalette.gray[10],
  /** Selected chrome / filled primary — family accent `#3b8cff` (`--ark-blue-9`). */
  accent: darkPalette.blue[8],
  ...darkColors,
  cryo: darkPalette.blue[10],
} as const;

const sharedShadows = darkShadows;

/** Mantine `color="red"` — `--app-color-bad` (filled) + `--app-color-danger-bright` (text/icons). */
export function createDangerRedPalette(
  bad: string,
  bright: string,
): [string, string, string, string, string, string, string, string, string, string] {
  return ["#fdecec", "#f5c8c8", "#eb9898", bright, "#c94444", bad, bright, "#9e2a2a", "#7a2020", "#561616"];
}

/** Mantine's 10-step colour tuple (`MantineColorsTuple` shape, without the Mantine import). */
type AppThemeLadder = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  ...string[],
];

/** Mantine 10-step scale per semantic family; index 5 is the `filled` base. */
export type AppThemeLadders = {
  ok: AppThemeLadder;
  attention: AppThemeLadder;
  fossil: AppThemeLadder;
  red: AppThemeLadder;
};

/**
 * Family-level typography profile (#PUX-005-B). Shared by the family's light and
 * dark variants unless a variant documents an exception. Every stack must have a
 * local fallback: a theme never loads a remote font.
 */
export type AppThemeTypography = {
  /** Body / UI stack. */
  body: string;
  /** Display stack for page titles and headings. */
  display: string;
  mono: string;
  /** Form labels and control text. */
  labelWeight: number;
  headingWeight: number;
  bodyLineHeight: number;
  /** `normal` or a letter-spacing value. */
  letterSpacing: string;
};

/**
 * Family-level radius ladder (#PUX-005-B), in comfortable-scale pixels. Fluent
 * ships the original 4 / 8 / 10; Plasma Breeze uses KDE's smaller ladder, where
 * controls are ~4px (`kstyle/breezemetrics.h` `Frame_FrameRadius = 5` →
 * `frameRadius()` ≈ 4.5, checkbox 4) and large surfaces (cards, popups, dialogs)
 * are `largeRadius = smallRadius * 2` ≈ 6px. Density scales it the same way the
 * shared tokens scale.
 */
export type AppThemeRadius = {
  sm: number;
  md: number;
  lg: number;
  control: number;
};

export const fluentRadius: AppThemeRadius = { sm: 4, md: 8, lg: 10, control: 4 };
export const plasmaBreezeRadius: AppThemeRadius = { sm: 4, md: 6, lg: 8, control: 4 };
/** Glassy rounds panels and controls a step past Fluent. */
export const glassyRadius: AppThemeRadius = { sm: 8, md: 12, lg: 16, control: 8 };

/**
 * Serializable surface material. Every value is a CSS string so a future pack can
 * carry the same object as JSON. Shipped families use {@link opaqueMaterials};
 * the resolver copies the fields onto `--app-*` and never branches on family id.
 */
export type AppThemeMaterials = {
  surfaceFilter: string;
  chromeFilter: string;
  raisedFilter: string;
  /** Navbar tint. Identity is transparent so Fluent/Breeze keep a clear rail. */
  chromeBg: string;
  /** Chrome-tone card fill. Identity is the opaque chrome step. */
  surfaceChromeBg: string;
  /** Card and table fill. Identity is the opaque panel step, not `--app-color-panel` (that role reads this field). */
  panelBg: string;
  /**
   * Floating plate on the scene (Recent activity, nested workspace cards).
   * Identity matches the panel, so Fluent and Breeze stay solid.
   */
  floatPanelBg: string;
  /** Neutral chip fill. Identity is the control step. */
  chipBg: string;
  /** Top-lit wash. Identity is `none`, so opaque families stay flat. */
  glassSheen: string;
  /** One-pixel catchlight on the top edge. Identity is `none`. */
  glassRim: string;
  /**
   * Base of an alert before the 12% tone mix. Identity is the solid alert
   * surface, so Fluent and Breeze keep today's bar. Glassy points it at the card.
   */
  alertFill: string;
  /**
   * Nested row inside a working card (Launch flags). Identity is the wash those
   * rows already used, so Fluent and Breeze do not move.
   */
  nestedRowBg: string;
  /** Raised step inside a panel (headers, alt wells). Identity stays gray-4. */
  panelRaisedBg: string;
  /** Alternate panel. Identity stays the control step; Glassy uses the raised frost. */
  panelAltBg: string;
  /** Hairline, frame, and control-border colours. Identity stays the gray ramp. */
  borderSubtle: string;
  border: string;
  borderControl: string;
  contentPaneBg: string;
  contentPaneBorder: string;
  contentPaneShadow: string;
  contentPaneRadius: string;
  /** Outer corner of discrete cards. Identity is square (`0px`). */
  panelRadius: string;
  /**
   * Panel sitting on a tab rule. Identity is square. Glassy keeps the bottom
   * radius and squares the top so the tab line does not leave corner gaps.
   */
  tabAttachedRadius: string;
  /**
   * Resting fill of an inactive tab. Identity is clear, so Fluent and Breeze
   * stay on Mantine's transparent tab. A glass theme can lay a quiet plate
   * under the label without a border.
   */
  tabInactiveBg: string;
  /**
   * Selected tab. Identity is the accent wash on the control hover, so Fluent
   * and Breeze keep today's chip. A glass theme can lift it a step above the
   * inactive plate.
   */
  tabActiveBg: string;
  tabActiveHoverBg: string;
  /** Space between backup metric tiles. Identity matches today's `xs` gap. */
  metricGap: string;
  /**
   * Fused collections (Overview server rows, fleet metric strip). Identity is a
   * square slab with shared hairlines. Glassy tiles each item.
   */
  collectionGap: string;
  collectionRadius: string;
  /** Top border of an adjacent item. `0px` fuses the hairline; `1px` keeps it. */
  collectionJoin: string;
  /** Outer strip border and cell dividers. `0px` drops them when items are tiled. */
  collectionFuse: string;
  collectionItemBorder: string;
  collectionStripFill: string;
  collectionItemShadow: string;
  /** Inner inset of a page content host. Identity is `0px` so existing shells keep their padding. */
  contentPanePadding: string;
  /** `1` keeps the shell grain; `0` hides it so frost reads the canvas. */
  shellGrainOpacity: string;
  /** Navbar seam. Identity is the current border mix. */
  chromeBorder: string;
  navSelectedBorder: string;
  navSelectedShadow: string;
  /** Card hover fill. Identity is the control step. */
  surfaceHover: string;
  /** Settings split: fused slab vs two frosted columns. */
  splitGap: string;
  splitPadding: string;
  splitRailBorder: string;
  splitRailShadow: string;
  splitPanelMax: string;
  splitPanelMargin: string;
  /** Settings preference stack. Identity is separate square cells. */
  settingStackBorder: string;
  settingStackBg: string;
  settingStackClip: string;
  settingRowBg: string;
  settingRowBorder: string;
  settingRowJoin: string;
  settingRowEdge: string;
  /** Sidebar seam. Identity is the plain border; Glassy adds the accent glow. */
  sidebarEdge: string;
  sidebarEdgeGlow: string;
  sidebarFooterBorder: string;
  sidebarFooterMargin: string;
  sidebarFooterPadding: string;
  sidebarFooterRadius: string;
  sidebarFooterBg: string;
  sidebarFooterFilter: string;
  versionChipPaddingTop: string;
  brandLightPadding: string;
  brandLightRadius: string;
  /** Light-scheme logo plate flex. Identity stretches the band; a chip uses `0 1 auto`. */
  brandLightFlex: string;
  /** Read-only path well. Identity is the chrome step at 72% so today's pills stay. */
  inputWellBg: string;
  /**
   * Menu and kebab flyout fill. Identity is Mantine's popover fill (white in
   * light, the control step in dark) so Fluent and Breeze do not move.
   */
  menuBg: string;
  /**
   * Flyout edge. Identity keeps Mantine's own popover shadow, so Fluent and
   * Breeze stay put. A glass theme draws a ring and a drop so the list lifts
   * off the scene.
   */
  menuShadow: string;
  /**
   * Toast fill. Identity is Mantine's white / dark-6 plate. A glass theme uses
   * the same translucent card as the other panels.
   */
  notificationBg: string;
  /**
   * Toast edge. Identity is Mantine's large shadow. A glass theme uses the
   * flyout ring and drop so the toast lifts off the scene.
   */
  notificationShadow: string;
  /**
   * SteamCMD console inset on Downloads. Identity keeps today's `xs` padding.
   * A glass theme opens a margin so the black terminal is not a hole in the pane.
   */
  downloadsConsoleInset: string;
  /**
   * Attention wash (alerts, differing cluster cells). Identity is Mantine's
   * transparent mix. A teal glass needs an opaque gold or the yellow goes olive.
   */
  attentionLight: string;
  attentionLightHover: string;
  /**
   * Idle icon button plate (`subtle` / `transparent`). Identity is Mantine's
   * transparent control, so Fluent and Breeze stay flat.
   */
  iconButtonBg: string;
  iconButtonBorder: string;
  /** `default` icon buttons. Identity is Mantine's default control fill. */
  iconButtonDefaultBg: string;
  iconButtonDefaultBorder: string;
  iconButtonFilter: string;
  iconButtonShadow: string;
  /**
   * Filled accent buttons (New server, Start). Identity is Mantine's solid
   * primary, so Fluent and Breeze stay flat. A glass theme can veil the accent.
   */
  primaryButtonBg: string;
  primaryButtonHover: string;
  primaryButtonBorder: string;
  /**
   * Label and icon on a filled accent button. Identity is white, so Fluent and
   * Breeze dark keep a light label. Mantine's autoContrast would paint those
   * bright accents black.
   */
  primaryButtonColor: string;
  /**
   * Disabled button and icon-button fill. Identity is Mantine's solid disabled
   * grey. A glass theme can thin it so the control recedes without a frost plate.
   */
  buttonDisabledBg: string;
  /**
   * Disabled `subtle` buttons. Identity stays clear so Fluent and Breeze do not
   * turn a text button into a slab. A glass theme can use the thinned disabled fill.
   */
  buttonDisabledQuietBg: string;
  navLinkColor: string;
  /** Raised list host (logs, cluster members). Identity adds no chrome. */
  listVesselBorder: string;
  listVesselBg: string;
  listVesselShadow: string;
  listRowBorder: string;
  listRowJoin: string;
  listRowEdge: string;
  listRowHover: string;
  tableHeadBg: string;
  queueSectionPadding: string;
  queueGroupGap: string;
  queueGroupRule: string;
  queueRowHover: string;
  serverListHover: string;
  serverListSelectedBorder: string;
  /**
   * Workspace server-list column. Identity is clear so the fused chrome shell
   * stays one surface. A glass theme can lay a light plate over the scene.
   */
  serverRailBg: string;
  /**
   * Workspace title and tab strip. Identity is clear, so Fluent and Breeze
   * keep the scene. A light glass theme can lay the same milk as the sidebar.
   */
  mastBg: string;
  /**
   * Overview server list. Identity is clear so the fused Fluent page stays on
   * the shell. A light glass theme can hold the rows on the sidebar milk.
   */
  overviewStageBg: string;
  /**
   * Inset of the overview list plate. Identity is `0px` so Fluent rows stay
   * flush. A light glass theme insets the cards inside the rounded plate.
   */
  overviewStagePad: string;
  /** Edge of that plate. Identity is `none`. */
  overviewStageBorder: string;
  /**
   * Overview Recent activity. Identity is the float panel. A light glass theme
   * can drop it to the same milk as the list.
   */
  overviewAsideBg: string;
  shellMainBg: string;
  /** Canvas wash behind frosted panels. Identity is `none`. */
  shellAtmosphere: string;
  /**
   * Scene plate behind the shell. Identity is `none`. A glass theme can set
   * `url(...)` so frost and the gaps between tiles read a picture.
   */
  shellScene: string;
  /**
   * Grid painted on the scene, under the darkening wash. Identity is `none`.
   */
  shellSceneGrid: string;
  /**
   * Darkening wash above the scene grid. Identity is `transparent`.
   */
  shellSceneVeil: string;
  /**
   * Blur between the photo and the grid. Identity is `none`, so the grid stays sharp.
   */
  shellSceneFilter: string;
  /** Row fill inside a fused list. Identity matches today's panel rows. */
  listRowBg: string;
  navSelectedFill: string;
  /** Width of the selected-nav notch. `0px` hides it when a fill carries selection. */
  navSelectedNotch: string;
  listSelectedBg: string;
  listSelectedInset: string;
  raisedBg: string;
  raisedBorder: string;
  raisedShadow: string;
};

/** Opaque families: no blur, no extra pane chrome, nav notch stays. */
export const opaqueMaterials: AppThemeMaterials = {
  surfaceFilter: "none",
  chromeFilter: "none",
  raisedFilter: "none",
  chromeBg: "transparent",
  surfaceChromeBg: "var(--app-color-surface-chrome)",
  panelBg: "var(--app-color-surface-panel)",
  floatPanelBg: "var(--app-color-panel)",
  chipBg: "var(--app-color-surface-control)",
  glassSheen: "none",
  glassRim: "none",
  alertFill: "var(--app-color-surface-alert)",
  nestedRowBg: "color-mix(in srgb, var(--app-color-bg) 35%, transparent)",
  panelRaisedBg: "var(--ark-gray-4)",
  panelAltBg: "var(--app-color-surface-control)",
  borderSubtle: "var(--ark-gray-7)",
  border: "var(--app-color-border-subtle)",
  borderControl: "var(--ark-gray-9)",
  contentPaneBg: "transparent",
  contentPaneBorder: "none",
  contentPaneShadow: "none",
  contentPaneRadius: "0px",
  panelRadius: "0px",
  tabAttachedRadius: "0px",
  tabInactiveBg: "transparent",
  tabActiveBg: "color-mix(in srgb, var(--app-color-accent) 12%, var(--app-color-surface-control-hover))",
  tabActiveHoverBg: "color-mix(in srgb, var(--app-color-accent) 16%, var(--app-color-surface-control-hover))",
  metricGap: "var(--app-space-xs)",
  collectionGap: "0px",
  collectionRadius: "0px",
  collectionJoin: "0px",
  collectionFuse: "1px",
  collectionItemBorder: "none",
  collectionStripFill: "var(--app-color-panel)",
  collectionItemShadow: "none",
  contentPanePadding: "0px",
  shellGrainOpacity: "1",
  chromeBorder: "color-mix(in srgb, var(--app-color-border) 28%, transparent)",
  navSelectedBorder: "none",
  navSelectedShadow: "none",
  surfaceHover: "var(--app-color-surface-control)",
  splitGap: "0px",
  splitPadding: "0px",
  splitRailBorder: "none",
  splitRailShadow: "none",
  splitPanelMax: "1440px",
  splitPanelMargin: "auto",
  settingStackBorder: "none",
  settingStackBg: "transparent",
  settingStackClip: "visible",
  settingRowBg: "var(--app-color-surface-panel)",
  settingRowBorder: "1px solid var(--app-color-border-subtle)",
  settingRowJoin: "-1px",
  settingRowEdge: "none",
  sidebarEdge: "var(--app-color-border)",
  sidebarEdgeGlow: "none",
  sidebarFooterBorder: "1px solid color-mix(in srgb, var(--app-color-border) 32%, transparent)",
  sidebarFooterMargin: "var(--app-space-xxs)",
  sidebarFooterPadding: "var(--app-space-sm)",
  sidebarFooterRadius: "0px",
  sidebarFooterBg: "transparent",
  sidebarFooterFilter: "none",
  versionChipPaddingTop: "var(--app-space-xs)",
  brandLightPadding: "0px",
  brandLightRadius: "0px",
  brandLightFlex: "1",
  inputWellBg: "color-mix(in srgb, var(--ark-gray-2) 72%, transparent)",
  menuBg: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))",
  menuShadow: "var(--popover-shadow, none)",
  notificationBg: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))",
  notificationShadow: "var(--mantine-shadow-lg)",
  downloadsConsoleInset: "var(--app-space-xs)",
  attentionLight:
    "light-dark(color-mix(in srgb, var(--app-color-attention) 14%, transparent), color-mix(in srgb, var(--app-color-attention) 22%, transparent))",
  attentionLightHover:
    "light-dark(color-mix(in srgb, var(--app-color-attention) 22%, transparent), color-mix(in srgb, var(--app-color-attention) 32%, transparent))",
  iconButtonBg: "transparent",
  iconButtonBorder: "calc(0.0625rem * var(--mantine-scale)) solid transparent",
  iconButtonDefaultBg: "var(--mantine-color-default)",
  iconButtonDefaultBorder: "calc(0.0625rem * var(--mantine-scale)) solid var(--mantine-color-default-border)",
  iconButtonFilter: "none",
  iconButtonShadow: "none",
  primaryButtonBg: "var(--mantine-primary-color-filled)",
  primaryButtonHover: "var(--mantine-primary-color-filled-hover)",
  primaryButtonBorder: "calc(0.0625rem * var(--mantine-scale)) solid transparent",
  primaryButtonColor: "var(--mantine-color-white)",
  buttonDisabledBg: "var(--mantine-color-disabled)",
  buttonDisabledQuietBg: "transparent",
  navLinkColor: "var(--app-color-text)",
  listVesselBorder: "none",
  listVesselBg: "transparent",
  listVesselShadow: "none",
  listRowBorder: "1px solid var(--app-color-border-subtle)",
  listRowJoin: "-1px",
  listRowEdge: "none",
  listRowHover: "var(--app-color-surface-control)",
  tableHeadBg: "var(--app-color-panel-raised)",
  queueSectionPadding: "0 2px 0 0",
  queueGroupGap: "var(--app-space-xs)",
  queueGroupRule: "1px solid color-mix(in srgb, var(--app-color-border) 58%, transparent)",
  queueRowHover: "var(--app-color-surface-control)",
  serverListHover: "color-mix(in srgb, var(--app-color-surface-control) 52%, transparent)",
  serverListSelectedBorder: "var(--app-color-accent-subtle)",
  serverRailBg: "transparent",
  mastBg: "transparent",
  overviewStageBg: "transparent",
  overviewStagePad: "0px",
  overviewStageBorder: "none",
  overviewAsideBg: "var(--app-float-panel-bg)",
  shellMainBg: "var(--app-color-surface-chrome)",
  shellAtmosphere: "none",
  shellScene: "none",
  shellSceneGrid: "none",
  shellSceneVeil: "transparent",
  shellSceneFilter: "none",
  listRowBg: "var(--app-color-panel)",
  navSelectedFill: "var(--app-list-selected-bg)",
  navSelectedNotch: "3px",
  listSelectedBg: "var(--app-color-surface-control)",
  listSelectedInset: "inset 3px 0 0 var(--ark-blue-9)",
  raisedBg: "var(--app-color-panel)",
  raisedBorder: "1px solid var(--app-color-border-subtle)",
  raisedShadow: "none",
};

/**
 * Documented contrast floors per theme (#PUX-005-B). The palette is swappable, so
 * "looks fine" is not a gate: each theme declares the floors it ships with and
 * `theme.contrast.test.ts` holds it to them. Fluent keeps the original Fluent 2
 * floors; Plasma Breeze declares the exact KDE Breeze accent behavior for
 * selection, focus, and filled primary actions.
 */
export type AppThemeContrast = {
  /** White label on the exact accent when used by a family-specific surface. */
  accentLabel: number;
  /** Accent solid as a non-text UI element (switch track, checkbox fill). */
  accentUi: number;
  /** Accent text/icon tone on the shell surfaces. */
  accentText: number;
  /** Body text on the shell surfaces. */
  text: number;
  /** Muted copy on the shell surfaces. */
  muted: number;
  /** Status tones as text on the panel. */
  status: number;
  /** `bad` as a filled control (non-text 3:1 bar). */
  statusFill: number;
  /** Card fill delta against the shell. */
  cardFill: number;
  /** Card hairline against the panel. */
  cardBorder: number;
};

export const darkLadders: AppThemeLadders = {
  ok: [
    "#e6f8f0",
    "#c8efdc",
    "#a5e5c6",
    "#7fd9ae",
    "#68d0a2",
    darkColors.ok,
    "#45b585",
    "#35986e",
    "#2a7a58",
    "#1f5c42",
  ],
  attention: [
    "#fbf4e8",
    "#f5e6c8",
    "#edcfa0",
    "#e5b878",
    darkColors.attention,
    darkColors.fossilFilled,
    "#a65408",
    "#8a4607",
    "#6e3805",
    "#4a2603",
  ],
  fossil: [
    "#fbf4e8",
    "#f5e6c8",
    "#edcfa0",
    "#e5b878",
    darkColors.fossil,
    darkColors.fossilFilled,
    "#a65408",
    "#8a4607",
    "#6e3805",
    "#4a2603",
  ],
  red: createDangerRedPalette(darkColors.bad, darkColors.dangerBright),
};

/** Light ladders: same shape, deeper tones so a filled step keeps a white label. */
export const lightLadders: AppThemeLadders = {
  ok: [
    "#e8f6ef",
    "#cbeadd",
    "#a6dbc5",
    "#7cc9a9",
    "#1f7a52",
    lightColors.ok,
    "#125c3c",
    "#0e4a30",
    "#0a3824",
    "#062818",
  ],
  attention: [
    "#fbf1e2",
    "#f4dfc0",
    "#ecc896",
    "#dfab63",
    "#a06a1a",
    lightColors.attention,
    "#734a0e",
    "#5c3a0a",
    "#452b07",
    "#2e1c04",
  ],
  fossil: [
    "#fbf1e2",
    "#f4dfc0",
    "#ecc896",
    "#dfab63",
    "#a06a1a",
    lightColors.fossil,
    "#734a0e",
    "#5c3a0a",
    "#452b07",
    "#2e1c04",
  ],
  red: [
    "#fdecec",
    "#f7d3d3",
    "#efb0b0",
    lightColors.dangerBright,
    "#c94040",
    lightColors.bad,
    lightColors.dangerBright,
    "#9e2a2a",
    "#7a2020",
    "#561616",
  ],
};

/** Fluent family typography (#PUX-005-B). One profile shared by both schemes. */
export const fluentTypography: AppThemeTypography = {
  body: '"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif',
  display: '"Segoe UI Variable Display", "Segoe UI Semibold", "Segoe UI", Arial, sans-serif',
  mono: '"Cascadia Mono", Consolas, monospace',
  labelWeight: 500,
  headingWeight: 600,
  bodyLineHeight: 1.5,
  letterSpacing: "normal",
};

/** Fluent dark floors (#PUX-004): the shipped dark theme's documented contract. */
export const darkContrast: AppThemeContrast = {
  accentLabel: 3,
  accentUi: 3,
  accentText: 4.5,
  text: 4.5,
  muted: 4.5,
  status: 4.5,
  statusFill: 3,
  cardFill: 1.1,
  cardBorder: 1.6,
};

/** Fluent light floors: the light accent was authored to clear AA as a label backdrop. */
export const lightContrast: AppThemeContrast = {
  accentLabel: 4.5,
  accentUi: 3,
  accentText: 4.5,
  text: 4.5,
  muted: 4.5,
  status: 4.5,
  statusFill: 3,
  cardFill: 1.03,
  cardBorder: 1.25,
};

export type AppTokens = {
  colors: typeof sharedColors;
  radius: { sm: number; md: number; lg: number; control: number };
  spacing: { xxs: number; xs: number; sm: number; md: number; lg: number; xl: number };
  fontSizes: { xs: number; sm: number; md: number; lg: number; xl: number };
  headings: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
  /** PageScaffold `h1` size (prior product used 28px, not Mantine h1 34). */
  pageTitle: number;
  /*
   * Section-title ramp (#PUX-004). Four levels, no ad-hoc font-size in features:
   * lg = page-level section, md = panel/card section, sm = dense sub-header,
   * eyebrow = uppercase label. Mantine's `Title` orders map onto lg/md/sm.
   */
  titleLg: number;
  titleMd: number;
  titleSm: number;
  eyebrowSize: number;
  /** Input/Select helper under labels — readable in Compact, slightly below label size. */
  formDescription: number;
  /** Input/Select field labels — always at or above description size. */
  formLabel: number;
  shadows: typeof sharedShadows;
};

const comfortableTokens: AppTokens = {
  colors: sharedColors,
  radius: { ...comfortableRadius },
  spacing: { ...comfortableSpacing },
  fontSizes: { ...comfortableFontSizes },
  headings: { ...comfortableHeadings },
  pageTitle: comfortablePageTitle,
  titleLg: 22,
  titleMd: 18,
  titleSm: 16,
  eyebrowSize: 11,
  formLabel: comfortableFontSizes.sm,
  formDescription: comfortableFontSizes.xs,
  shadows: sharedShadows,
};

const compactTokens: AppTokens = {
  colors: sharedColors,
  radius: scaleRecord(comfortableRadius, UI_DENSITY_COMPACT_SCALE),
  spacing: scaleRecord(comfortableSpacing, UI_DENSITY_COMPACT_SCALE),
  fontSizes: scaleRecord(comfortableFontSizes, UI_DENSITY_COMPACT_SCALE),
  headings: scaleRecord(comfortableHeadings, UI_DENSITY_COMPACT_SCALE),
  pageTitle: scalePx(comfortablePageTitle, UI_DENSITY_COMPACT_SCALE),
  titleLg: scalePx(22, UI_DENSITY_COMPACT_SCALE),
  titleMd: scalePx(18, UI_DENSITY_COMPACT_SCALE),
  titleSm: scalePx(16, UI_DENSITY_COMPACT_SCALE),
  eyebrowSize: scalePx(11, UI_DENSITY_COMPACT_SCALE),
  formLabel: 13,
  formDescription: scalePx(comfortableFontSizes.xs, UI_DENSITY_COMPACT_SCALE),
  shadows: sharedShadows,
};

/** Default / Comfortable tokens (backward-compatible export). */
export const appTokens: AppTokens = comfortableTokens;

export function getAppTokens(density: UiDensity): AppTokens {
  return density === "compact" ? compactTokens : comfortableTokens;
}

/**
 * Shared tokens with the family's radius ladder applied (#PUX-005-B). Spacing,
 * fonts and headings stay shared; only the corners are family-owned.
 */
export function getAppTokensForTheme(density: UiDensity, radius: AppThemeRadius): AppTokens {
  const base = getAppTokens(density);
  const scaled = density === "compact" ? scaleRecord(radius, UI_DENSITY_COMPACT_SCALE) : radius;
  return { ...base, radius: { ...scaled } };
}
