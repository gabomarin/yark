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
type AppThemeRamp = readonly [
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
function createDangerRedPalette(
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
