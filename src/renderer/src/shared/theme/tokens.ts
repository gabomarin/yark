import type { UiDensity } from "@shared/ui-density";

export type { UiDensity } from "@shared/ui-density";

export const radixPalette = {
  background: "#0c1427",
  /** INI editor category group header fill. */
  iniCategory: "#131F43",
  blue: [
    "#061232",
    "#06143c",
    "#081f61",
    "#122c6f",
    "#1d387c",
    "#274489",
    "#335197",
    "#4160a8",
    "#4c6db5",
    "#3f5fa6",
    "#90b5ff",
    "#cde2ff",
  ],
  blueAlpha: [
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
  sm: 10,
  md: 14,
  lg: 18,
  /** Inputs, list rows, search — tighter than card `md`. */
  control: 12,
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
  border: radixPalette.gray[5],
  text: radixPalette.gray[11],
  muted: radixPalette.gray[10],
  accent: radixPalette.blue[8],
  ok: "#58c89a",
  warn: "#d9a85f",
  /** Needs-attention UI (update pending, card rail). */
  attention: "#E6ED62",
  /** Alerts, rails, destructive filled buttons. */
  bad: "#BE3636",
  /** Menu danger rows + Stop icon on dark surfaces (readable, matches card Stop light). */
  dangerBright: "#D65555",
  cryo: radixPalette.blue[10],
  biomass: "#58c89a",
  fossil: "#d9a85f",
  /** Richer amber for Restart `filled` buttons; white label/icon via theme autoContrast. */
  fossilFilled: "#C2610A",
} as const;

const sharedShadows = {
  panel: "0 1px 0 rgba(255, 255, 255, 0.025)",
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
  shadows: typeof sharedShadows;
};

const comfortableTokens: AppTokens = {
  colors: sharedColors,
  radius: { ...comfortableRadius },
  spacing: { ...comfortableSpacing },
  fontSizes: { ...comfortableFontSizes },
  headings: { ...comfortableHeadings },
  pageTitle: comfortablePageTitle,
  shadows: sharedShadows,
};

const compactTokens: AppTokens = {
  colors: sharedColors,
  radius: scaleRecord(comfortableRadius, UI_DENSITY_COMPACT_SCALE),
  spacing: scaleRecord(comfortableSpacing, UI_DENSITY_COMPACT_SCALE),
  fontSizes: scaleRecord(comfortableFontSizes, UI_DENSITY_COMPACT_SCALE),
  headings: scaleRecord(comfortableHeadings, UI_DENSITY_COMPACT_SCALE),
  pageTitle: scalePx(comfortablePageTitle, UI_DENSITY_COMPACT_SCALE),
  shadows: sharedShadows,
};

/** Default / Comfortable tokens (backward-compatible export). */
export const appTokens: AppTokens = comfortableTokens;

export function getAppTokens(density: UiDensity): AppTokens {
  return density === "compact" ? compactTokens : comfortableTokens;
}
