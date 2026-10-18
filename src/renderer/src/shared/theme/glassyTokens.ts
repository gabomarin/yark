import {
  darkColors,
  darkLadders,
  darkSurfaces,
  fluentTypography,
  lightColors,
  lightLadders,
  lightSurfaces,
  type AppThemeColors,
  type AppThemeContrast,
  type AppThemeMaterials,
  type AppThemePalette,
  type AppThemeRamp,
  type AppThemeShadows,
} from "./tokens";

/**
 * Glassy family tokens (#PUX-005-A).
 *
 * ARK-cyan frost, but the *opacity ladder* is YARK Fluent 2's surface steps
 * (canvas → chrome → panel → raised → control), not the ARK kit's glass-weak
 * / glass / glass-strong scale. Relative luminance from the Fluent ramp
 * (`tokens.ts` gray 1–5) is mapped onto glass as both cover *and* luminance —
 * the same teal at 0.16/0.28/0.46 collapses to one navy slab over a night
 * photo. Chrome (rail) is darker/more open; content panels are milkier and
 * denser; raised controls denser still. Dark is teal-navy with
 * accent `#28d4ec`; Light is milky sky glass. Semantic status tones reuse
 * Fluent's measured values.
 */

const glassyDarkBlue: AppThemeRamp = [
  "#03151c",
  "#042028",
  "#063445",
  "#0a4d63",
  "#0d6884",
  "#1285a6",
  "#16a8c9",
  "#1dc0dc",
  "#28d4ec",
  "#51e3f4",
  "#7aedf8",
  "#c5f6fb",
];

const glassyDarkBlueAlpha: AppThemeRamp = [
  "#28d4ec0f",
  "#28d4ec1f",
  "#28d4ec33",
  "#28d4ec45",
  "#28d4ec59",
  "#28d4ec6e",
  "#28d4ec85",
  "#28d4ec99",
  "#28d4eca8",
  "#28d4ec96",
  "#7aedf8",
  "#c5f6fb",
];

const glassyLightBlue: AppThemeRamp = [
  "#eff9ff",
  "#ddf2ff",
  "#c4e8fc",
  "#a5dcf7",
  "#82ccf0",
  "#60b9e6",
  "#3fa3d7",
  "#258ac6",
  "#176fb3",
  "#115f9c",
  "#0e548a",
  "#093756",
];

const glassyLightBlueAlpha: AppThemeRamp = [
  "#176fb30a",
  "#176fb312",
  "#176fb324",
  "#176fb333",
  "#176fb342",
  "#176fb352",
  "#176fb366",
  "#176fb380",
  "#176fb399",
  "#176fb38c",
  "#0e548acc",
  "#093756f2",
];

const glassyDarkGray: AppThemeRamp = [
  "#041017",
  "#0a1b25",
  "#0c2834",
  "#123140",
  "#164056",
  "#1c4d60",
  "#3d6a78",
  "#4d7d8c",
  "#638692",
  "#7a9eaa",
  "#86aeba",
  "#e8f8fb",
];

const glassyDarkGrayAlpha: AppThemeRamp = [
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

const glassyLightGray: AppThemeRamp = [
  "#ffffff",
  "#eaf5fa",
  "#f6fbfd",
  "#f7fcfe",
  "#eff8fc",
  "#e5f3f8",
  "#8bb0c6",
  "#7aa0b4",
  "#6d92aa",
  "#5c8294",
  "#557384",
  "#102433",
];

const glassyLightGrayAlpha: AppThemeRamp = [
  "#10243300",
  "#10243305",
  "#1024330a",
  "#10243312",
  "#1024331c",
  "#10243329",
  "#10243338",
  "#1024334d",
  "#10243366",
  "#1024339e",
  "#102433e6",
  "#102433f5",
];

export const glassyDarkPalette: AppThemePalette = {
  background: "#06131b",
  blue: glassyDarkBlue,
  blueAlpha: glassyDarkBlueAlpha,
  gray: glassyDarkGray,
  grayAlpha: glassyDarkGrayAlpha,
  /** Dark ink on the ARK cyan solid — measured 10.39:1. */
  blueContrast: "#03151c",
  blueSurface: "#28d4ec1f",
  grayContrast: "#e8f8fb",
  graySurface: "rgba(0, 0, 0, 0.05)",
};

export const glassyLightPalette: AppThemePalette = {
  background: "#e9f5fa",
  blue: glassyLightBlue,
  blueAlpha: glassyLightBlueAlpha,
  gray: glassyLightGray,
  grayAlpha: glassyLightGrayAlpha,
  blueContrast: "#ffffff",
  blueSurface: "#176fb31a",
  grayContrast: "#102433",
  graySurface: "rgba(16, 36, 51, 0.04)",
};

export const glassyDarkColors: AppThemeColors = darkColors;
export const glassyLightColors: AppThemeColors = lightColors;
export const glassyDarkSurfaces = darkSurfaces;
export const glassyLightSurfaces = lightSurfaces;
export const glassyDarkLadders = darkLadders;
export const glassyLightLadders = lightLadders;
export const glassyTypography = fluentTypography;

export const glassyDarkShadows: AppThemeShadows = {
  panel: "inset 0 1px 0 rgba(218,250,255,.28), inset 0 -1px 0 rgba(0,0,0,.14), 0 8px 28px rgba(0,0,0,.18)",
  elevation2: "0 2px 8px rgba(0,0,0,.14), inset 0 1px 0 rgba(218,250,255,.12)",
  elevation4: "inset 0 1px 0 rgba(218,250,255,.28), inset 0 -1px 0 rgba(0,0,0,.14), 0 8px 28px rgba(0,0,0,.18)",
  elevation8: "inset 0 1px 0 rgba(218,250,255,.28), 0 10px 26px rgba(0,0,0,.18)",
  elevation16: "inset 0 1px 0 rgba(225,250,255,.32), 0 14px 34px rgba(0,0,0,.22)",
  elevation28: "inset 0 1px 0 rgba(225,250,255,.32), 0 18px 40px rgba(0,0,0,.26)",
};

export const glassyLightShadows: AppThemeShadows = {
  panel: "inset 0 1px 0 rgba(255,255,255,.84), inset 0 -1px 0 rgba(67,115,137,.08), 0 8px 24px rgba(43,85,104,.09)",
  elevation2: "0 2px 8px rgba(43,85,104,.08), inset 0 1px 0 rgba(255,255,255,.42)",
  elevation4: "inset 0 1px 0 rgba(255,255,255,.84), inset 0 -1px 0 rgba(67,115,137,.08), 0 8px 24px rgba(43,85,104,.09)",
  elevation8: "inset 0 1px 0 rgba(255,255,255,.88), 0 10px 26px rgba(43,85,104,.10)",
  elevation16: "inset 0 1px 0 rgba(255,255,255,.94), 0 14px 30px rgba(43,85,104,.12)",
  elevation28: "inset 0 1px 0 rgba(255,255,255,.94), 0 18px 40px rgba(43,85,104,.14)",
};

export const glassyDarkMaterials: AppThemeMaterials = {
  chrome: {
    background: "rgba(14,42,56,0.42)",
    fallback: "#0a1b25",
    backdropFilter: "blur(22px) saturate(150%)",
  },
  content: {
    background: "rgba(32,72,90,0.60)",
    fallback: "#0c2834",
    backdropFilter: "blur(26px) saturate(155%)",
  },
  raised: {
    background: "rgba(46,88,108,0.84)",
    fallback: "#123140",
    backdropFilter: "blur(14px) saturate(140%)",
  },
  overlay: {
    background: "rgba(6,22,32,0.92)",
    fallback: "#0a1b25",
    backdropFilter: "blur(16px) saturate(130%)",
  },
  innerHighlight: "rgba(218,250,255,0.28)",
  scrim: "rgba(3,11,17,0.55)",
};

export const glassyLightMaterials: AppThemeMaterials = {
  chrome: {
    background: "rgba(255,255,255,0.40)",
    fallback: "#eaf5fa",
    backdropFilter: "blur(22px) saturate(150%)",
  },
  content: {
    background: "rgba(255,255,255,0.64)",
    fallback: "#f6fbfd",
    backdropFilter: "blur(26px) saturate(155%)",
  },
  raised: {
    background: "rgba(255,255,255,0.88)",
    fallback: "#eff8fc",
    backdropFilter: "blur(14px) saturate(140%)",
  },
  overlay: {
    background: "rgba(246,251,253,0.94)",
    fallback: "#fafdff",
    backdropFilter: "blur(16px) saturate(130%)",
  },
  innerHighlight: "rgba(255,255,255,0.92)",
  scrim: "rgba(43,85,104,0.18)",
};

export const glassyDarkContrast: AppThemeContrast = {
  accentLabel: 4.5,
  accentUi: 3,
  accentText: 4.5,
  text: 4.5,
  muted: 4.5,
  status: 4.5,
  statusFill: 3,
  cardFill: 1.09,
  cardBorder: 1.6,
};

export const glassyLightContrast: AppThemeContrast = {
  accentLabel: 4.5,
  accentUi: 3,
  accentText: 4.5,
  text: 4.5,
  muted: 4.5,
  status: 4.5,
  statusFill: 3,
  cardFill: 1.03,
  cardBorder: 1.5,
};
