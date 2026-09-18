import type { UiDensity } from "@shared/settings/ui-density";

export type { UiDensity } from "@shared/settings/ui-density";

/**
 * The single accent source (#PUX-004). Everything accent-shaped derives from it:
 * the `--ark-blue-*` Radix-style steps + alphas, Mantine's `blue` scale, and the
 * `--app-color-accent*` role tokens. Swap these two arrays and every interactive,
 * selected, focus, and "YARK-owned" surface follows — no feature CSS changes.
 *
 * Step 9 is the solid accent, 10 the hover, 11 the text/icon tone.
 */
export const accentPalette = {
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

export const radixPalette = {
  background: "#0c1427",
  /**
   * INI category header fill — deep blue (not gray-slate) between hull
   * (`#0c1427`) and ark-blue-2. Base for the subtle ~90% blue header lift.
   */
  iniCategory: "#0d1836",
  blue: accentPalette.steps,
  blueAlpha: accentPalette.alpha,
  gray: [
    "#000000",
    "#121213",
    "#1f1f1f",
    "#282829",
    "#303030",
    "#39393b",
    "#484849",
    "#5f5f61",
    "#6e6e6f",
    "#7b7b7c",
    "#b4b4b5",
    "#eeeef0",
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
} as const;

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

function scaleRecord<T extends Record<string, number>>(
  source: T,
  factor: number,
): { [K in keyof T]: number } {
  const out = {} as { [K in keyof T]: number };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const value = source[key];
    out[key] = scalePx(value as number, factor);
  }
  return out;
}

const sharedColors = {
  bg: radixPalette.background,
  bgAccent: radixPalette.gray[1],
  panel: radixPalette.gray[2],
  panelAlt: radixPalette.gray[3],
  /** Hairline between page / panel / control — solid, not mixed with blue. */
  border: radixPalette.gray[6],
  text: radixPalette.gray[11],
  /** Helper / Mantine `c="dimmed"` — Radix step 11 of the active neutral ramp. */
  muted: radixPalette.gray[10],
  /** Selected chrome / filled primary — family accent `#3b8cff` (`--ark-blue-9`). */
  accent: radixPalette.blue[8],
  ok: "#58c89a",
  warn: "#d9a85f",
  /** Needs-attention UI (update pending, card rail) — fossil/amber, not lime (#470). */
  attention: "#d9a85f",
  /** Alerts, rails, destructive filled buttons. Clears 3:1 on panel and keeps white labels. */
  bad: "#C94040",
  /** Menu danger rows + Stop icon on dark surfaces. Meets AA text on panel (5.0:1). */
  dangerBright: "#DE6A6A",
  cryo: radixPalette.blue[10],
  biomass: "#58c89a",
  fossil: "#d9a85f",
  /** Richer amber for Restart `filled` buttons; white label/icon via theme autoContrast. */
  fossilFilled: "#C2610A",
} as const;

const sharedShadows = {
  panel: "0 1px 0 rgba(255, 255, 255, 0.06)",
  /*
   * Fluent 2 elevation scale: two layers per level (an ambient spread plus a key
   * offset shadow). The number is Fluent's depth in px, so the ladder stays
   * traceable to the spec. Alphas are tuned for the dark app surface - a light
   * theme (Track B) must retune them rather than reuse these.
   */
  elevation2: "0 0 2px rgba(0, 0, 0, 0.28), 0 1px 2px rgba(0, 0, 0, 0.32)",
  elevation4: "0 0 2px rgba(0, 0, 0, 0.28), 0 2px 4px rgba(0, 0, 0, 0.34)",
  elevation8: "0 0 2px rgba(0, 0, 0, 0.3), 0 4px 8px rgba(0, 0, 0, 0.38)",
  elevation16: "0 0 4px rgba(0, 0, 0, 0.3), 0 8px 16px rgba(0, 0, 0, 0.42)",
  elevation28: "0 0 8px rgba(0, 0, 0, 0.3), 0 14px 28px rgba(0, 0, 0, 0.46)",
} as const;

/** Mantine `color="red"` — `--app-color-bad` (filled) + `--app-color-danger-bright` (text/icons). */
export function createDangerRedPalette(
  bad: string,
  bright: string,
): [
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
] {
  return [
    "#fdecec",
    "#f5c8c8",
    "#eb9898",
    bright,
    "#c94444",
    bad,
    bright,
    "#9e2a2a",
    "#7a2020",
    "#561616",
  ];
}

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
