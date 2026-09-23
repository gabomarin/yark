import {
  createDangerRedPalette,
  type AppThemeColors,
  type AppThemeContrast,
  type AppThemeLadders,
  type AppThemePalette,
  type AppThemeRamp,
  type AppThemeShadows,
  type AppThemeSurfaces,
  type AppThemeTypography,
} from "./tokens";

/**
 * Plasma Breeze family tokens (#PUX-005-B).
 *
 * Anchored on the exact KDE Breeze colour schemes
 * (`KDE/breeze` -> `colors/BreezeLight.colors`, `colors/BreezeDark.colors`).
 * The anchors are Breeze's own values:
 *
 * - accent / focus / selection: `#3daee9` (`61,174,233`), used as the solid
 *   accent and the selection background in both variants;
 * - Breeze Light window `#eff0f1`, view `#ffffff`, header `#dee0e2`,
 *   foreground `#232629`, inactive `#707d8a`, link `#2980b9`;
 * - Breeze Dark window `#202326`, view `#141618`, button/header `#292c30`,
 *   foreground `#fcfcfc`, inactive `#a1a9b1`, link `#1d99f3`;
 * - status: negative `#da4453`, neutral `#f67400`, positive `#27ae60`.
 *
 * Breeze does not ship 12-step ramps, so the steps between the anchors are
 * authored here to satisfy YARK's role map and its contrast floors. Where YARK's
 * AA floors force a value away from Breeze (muted copy, status text, the filled
 * primary label) the deviation is recorded in `docs/design-system.md`. The two
 * variants are authored independently - Breeze Light is not an inversion of
 * Breeze Dark (the content/view polarity actually flips between them).
 */

/** Breeze accent `#3daee9` as a light-theme ramp; index 9 (solid) is the exact accent. */
const breezeLightBlue: AppThemeRamp = [
  "#f0f9fe",
  "#ddf1fc",
  "#c0e7f9",
  "#a0dbf6",
  "#80cff2",
  "#64c4ee",
  "#52bbec",
  "#46b6ea",
  "#3daee9",
  "#2f9ed6",
  "#15607f",
  "#0a3d52",
];

const breezeLightBlueAlpha: AppThemeRamp = [
  "#3daee90a",
  "#3daee912",
  "#3daee924",
  "#3daee933",
  "#3daee942",
  "#3daee952",
  "#3daee966",
  "#3daee980",
  "#3daee999",
  "#3daee98c",
  "#15607fcc",
  "#0a3d52f2",
];

/** Breeze accent as a dark-theme ramp; index 9 (solid) is the exact accent. */
const breezeDarkBlue: AppThemeRamp = [
  "#06202c",
  "#0a2f42",
  "#10425c",
  "#175675",
  "#1f6a8f",
  "#277ea9",
  "#2f92c3",
  "#36a0d6",
  "#3daee9",
  "#55b8ec",
  "#8ccdf3",
  "#c9e8fb",
];

const breezeDarkBlueAlpha: AppThemeRamp = [
  "#3daee90d",
  "#3daee919",
  "#3daee945",
  "#3daee955",
  "#3daee965",
  "#3daee974",
  "#3daee985",
  "#3daee999",
  "#3daee9a8",
  "#3daee996",
  "#8ccdf3",
  "#c9e8fb",
];

/**
 * Breeze Light neutral ramp (lightest -> darkest). The role map picks:
 * chrome 2, panel 3 (window `#eff0f1`), control 5 (header `#dee0e2`),
 * border-subtle 7 (`#c8ccd0`, Breeze frame), border-control 9 (`#b6bbc0`),
 * muted 11, text 12 (`#232629`). The two border steps stay close together the
 * way Breeze's frame and hairline do, instead of a heavy control border.
 */
const breezeLightGray: AppThemeRamp = [
  "#ffffff",
  "#f7f7f7",
  "#eff0f1",
  "#e3e5e7",
  "#dee0e2",
  "#d3d7db",
  "#c8ccd0",
  "#bfc3c7",
  "#b6bbc0",
  "#9aa0a6",
  "#555b62",
  "#232629",
];

const breezeLightGrayAlpha: AppThemeRamp = [
  "#23262900",
  "#23262905",
  "#2326290a",
  "#23262912",
  "#2326291c",
  "#23262929",
  "#23262938",
  "#2326294d",
  "#23262966",
  "#2326299e",
  "#232629e6",
  "#232629f5",
];

/**
 * Breeze Dark neutral ramp (darkest -> lightest): view `#141618`, window
 * `#202326`, button/header `#292c30`, foreground `#fcfcfc`. Muted sits on step 11
 * (`#a6aeb6`, Breeze's ForegroundInactive lifted to clear AA on the control fill)
 * and text on step 12, so "dimmed" copy really is dimmer than body text.
 */
const breezeDarkGray: AppThemeRamp = [
  "#141618",
  "#202326",
  "#292c30",
  "#31363b",
  "#3a4046",
  "#454b52",
  "#525860",
  "#5c6269",
  "#666c74",
  "#8a9199",
  "#a6aeb6",
  "#fcfcfc",
];

const breezeDarkGrayAlpha: AppThemeRamp = [
  "#ffffff00",
  "#ffffff10",
  "#ffffff1c",
  "#ffffff26",
  "#ffffff33",
  "#ffffff40",
  "#ffffff52",
  "#ffffff66",
  "#ffffff80",
  "#ffffff9e",
  "#fffffff0",
  "#ffffff",
];

export const plasmaBreezeLightPalette: AppThemePalette = {
  /** Breeze header `#dee0e2`: the frame behind the shell, a step under the window. */
  background: "#e3e5e7",
  blue: breezeLightBlue,
  blueAlpha: breezeLightBlueAlpha,
  gray: breezeLightGray,
  grayAlpha: breezeLightGrayAlpha,
  /** Breeze puts a white label on the `#3daee9` selection; kept exactly. */
  blueContrast: "#ffffff",
  blueSurface: "#3daee924",
  grayContrast: "#1a1c1f",
  graySurface: "rgba(0, 0, 0, 0.04)",
};

export const plasmaBreezeDarkPalette: AppThemePalette = {
  /** Breeze view `#141618`: the darkest surface, behind the shell. */
  background: "#141618",
  blue: breezeDarkBlue,
  blueAlpha: breezeDarkBlueAlpha,
  gray: breezeDarkGray,
  grayAlpha: breezeDarkGrayAlpha,
  blueContrast: "#fcfcfc",
  blueSurface: "#3daee940",
  grayContrast: "#141618",
  graySurface: "rgba(255, 255, 255, 0.05)",
};

/**
 * Breeze Light semantics. The hue anchors are Breeze's (positive green, neutral
 * amber, negative red); the tones are darkened so they clear AA as text on the
 * near-white panel, which Breeze's raw status colours do not.
 */
export const plasmaBreezeLightColors: AppThemeColors = {
  ok: "#167a42",
  warn: "#8a4b00",
  attention: "#8a4b00",
  bad: "#da4453",
  dangerBright: "#b03745",
  biomass: "#167a42",
  fossil: "#8a4b00",
  fossilFilled: "#c2610a",
};

/** Breeze Dark semantics: the raw Breeze tones already clear AA on the dark panel. */
export const plasmaBreezeDarkColors: AppThemeColors = {
  ok: "#27ae60",
  warn: "#f67400",
  attention: "#f67400",
  bad: "#da4453",
  dangerBright: "#e8808c",
  biomass: "#27ae60",
  fossil: "#f67400",
  fossilFilled: "#f67400",
};

export const plasmaBreezeLightSurfaces: AppThemeSurfaces = {
  alert: "var(--ark-gray-1)",
};

export const plasmaBreezeDarkSurfaces: AppThemeSurfaces = {
  alert: "color-mix(in srgb, var(--ark-gray-2) 82%, var(--ark-gray-12))",
};

/** Breeze is flat: hairline first, shadows barely there and never layered deep. */
export const plasmaBreezeLightShadows: AppThemeShadows = {
  panel: "0 1px 0 rgba(16, 24, 40, 0.05)",
  elevation2: "0 1px 2px rgba(0, 0, 0, 0.06)",
  elevation4: "0 2px 4px rgba(0, 0, 0, 0.08)",
  elevation8: "0 3px 6px rgba(0, 0, 0, 0.1)",
  elevation16: "0 6px 12px rgba(0, 0, 0, 0.12)",
  elevation28: "0 10px 20px rgba(0, 0, 0, 0.14)",
};

export const plasmaBreezeDarkShadows: AppThemeShadows = {
  panel: "0 1px 0 rgba(255, 255, 255, 0.05)",
  elevation2: "0 1px 2px rgba(0, 0, 0, 0.3)",
  elevation4: "0 2px 4px rgba(0, 0, 0, 0.35)",
  elevation8: "0 3px 6px rgba(0, 0, 0, 0.4)",
  elevation16: "0 6px 12px rgba(0, 0, 0, 0.45)",
  elevation28: "0 10px 20px rgba(0, 0, 0, 0.5)",
};

export const plasmaBreezeLightLadders: AppThemeLadders = {
  ok: ["#e6f6ec", "#c9ead6", "#a2dabb", "#74c79c", "#3fae74", "#167a42", "#116337", "#0d4e2c", "#093a20", "#062715"],
  attention: [
    "#fbf0e2",
    "#f5ddc0",
    "#ecc896",
    "#e0ac63",
    "#b06a1a",
    "#8a4b00",
    "#733e00",
    "#5c3100",
    "#452500",
    "#2e1800",
  ],
  fossil: ["#fbf0e2", "#f5ddc0", "#ecc896", "#e0ac63", "#b06a1a", "#8a4b00", "#733e00", "#5c3100", "#452500", "#2e1800"],
  red: createDangerRedPalette("#da4453", "#b03745"),
};

export const plasmaBreezeDarkLadders: AppThemeLadders = {
  ok: ["#e6f8ef", "#c6efd9", "#9fe3bf", "#74d6a2", "#4ec286", "#27ae60", "#1f9350", "#197841", "#136032", "#0d4825"],
  attention: [
    "#fdf0e0",
    "#fadfc0",
    "#f6c98f",
    "#f3b15c",
    "#f48220",
    "#f67400",
    "#d56400",
    "#b35300",
    "#914300",
    "#6e3200",
  ],
  fossil: ["#fdf0e0", "#fadfc0", "#f6c98f", "#f3b15c", "#f48220", "#f67400", "#d56400", "#b35300", "#914300", "#6e3200"],
  red: createDangerRedPalette("#da4453", "#e8808c"),
};

/**
 * Family-level typography profile. KDE's default UI font is Noto Sans; the stack
 * falls back to Segoe UI / system-ui so Windows and Linux both render locally.
 * Breeze headings differ from body by weight, not family, so `display` matches
 * `body`; the mono stack leads with KDE's Hack and falls back to Cascadia.
 */
export const plasmaBreezeTypography: AppThemeTypography = {
  body: '"Noto Sans", "Segoe UI", system-ui, sans-serif',
  display: '"Noto Sans", "Segoe UI", system-ui, sans-serif',
  mono: '"Hack", "Cascadia Mono", Consolas, monospace',
  labelWeight: 500,
  headingWeight: 600,
  bodyLineHeight: 1.4,
  letterSpacing: "normal",
};

/**
 * Documented floors for the exact Breeze accent. `#3daee9` is a mid-tone: as a
 * non-text UI element it sits ~2.3:1 on the light shell and a white label on it
 * is ~2.49:1, both below AA. KDE ships Breeze that way, so the family declares
 * those floors instead of pretending otherwise; every text and status tone still
 * clears AA. See `docs/design-system.md` (Breeze deviations).
 */
export const plasmaBreezeLightContrast: AppThemeContrast = {
  accentLabel: 2.4,
  accentUi: 1.8,
  accentText: 4.5,
  text: 4.5,
  muted: 4.5,
  status: 4.5,
  statusFill: 3,
  cardFill: 1.03,
  cardBorder: 1.25,
};

export const plasmaBreezeDarkContrast: AppThemeContrast = {
  accentLabel: 2.4,
  accentUi: 3,
  accentText: 4.5,
  text: 4.5,
  muted: 4.5,
  status: 4.5,
  statusFill: 3,
  cardFill: 1.1,
  cardBorder: 1.6,
};
