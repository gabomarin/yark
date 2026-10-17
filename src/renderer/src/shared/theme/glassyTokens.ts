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
 * Cool-neutral operations glass: a Mica-like tinted canvas, selective frost on
 * persistent chrome and transient overlays, and opaque content surfaces. Light
 * and Dark are authored independently — Dark is not an inversion of Light.
 * Semantic status tones reuse Fluent's measured values so operational state
 * stays recognizable across families.
 */

const glassyDarkBlue: AppThemeRamp = [
  "#071a28",
  "#082335",
  "#0b3150",
  "#104269",
  "#165481",
  "#1d6699",
  "#2579b2",
  "#2f8dcc",
  "#4ba8e8",
  "#68b8f0",
  "#8dccf5",
  "#c7eafc",
];

const glassyDarkBlueAlpha: AppThemeRamp = [
  "#4ba8e80d",
  "#4ba8e819",
  "#4ba8e845",
  "#4ba8e855",
  "#4ba8e865",
  "#4ba8e874",
  "#4ba8e885",
  "#4ba8e899",
  "#4ba8e8a8",
  "#4ba8e896",
  "#8dccf5",
  "#c7eafc",
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
  "#070b12",
  "#0d1420",
  "#141e2c",
  "#1a2636",
  "#223146",
  "#2b3b52",
  "#43566f",
  "#536984",
  "#667d99",
  "#7b91aa",
  "#b4c3d5",
  "#f2f7fc",
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
  "#f7fafd",
  "#f0f5fa",
  "#e8eff6",
  "#dce6ef",
  "#cfdce8",
  "#b9c8d7",
  "#a5b6c7",
  "#7a8fa5",
  "#667b90",
  "#4f6173",
  "#182431",
];

const glassyLightGrayAlpha: AppThemeRamp = [
  "#18243100",
  "#18243105",
  "#1824310a",
  "#18243112",
  "#1824311c",
  "#18243129",
  "#18243138",
  "#1824314d",
  "#18243166",
  "#1824319e",
  "#182431e6",
  "#182431f5",
];

export const glassyDarkPalette: AppThemePalette = {
  background: "#070b12",
  blue: glassyDarkBlue,
  blueAlpha: glassyDarkBlueAlpha,
  gray: glassyDarkGray,
  grayAlpha: glassyDarkGrayAlpha,
  /** Dark ink on the bright cyan solid — measured 6.79:1. */
  blueContrast: "#071a28",
  blueSurface: "#4ba8e840",
  grayContrast: "#f2f7fc",
  graySurface: "rgba(0, 0, 0, 0.05)",
};

export const glassyLightPalette: AppThemePalette = {
  background: "#e8eff6",
  blue: glassyLightBlue,
  blueAlpha: glassyLightBlueAlpha,
  gray: glassyLightGray,
  grayAlpha: glassyLightGrayAlpha,
  blueContrast: "#ffffff",
  blueSurface: "#176fb324",
  grayContrast: "#182431",
  graySurface: "rgba(0, 0, 0, 0.04)",
};

export const glassyDarkColors: AppThemeColors = darkColors;
export const glassyLightColors: AppThemeColors = lightColors;
export const glassyDarkSurfaces = darkSurfaces;
export const glassyLightSurfaces = lightSurfaces;
export const glassyDarkLadders = darkLadders;
export const glassyLightLadders = lightLadders;
export const glassyTypography = fluentTypography;

export const glassyDarkShadows: AppThemeShadows = {
  panel: "inset 0 1px 0 rgba(255,255,255,.08), 0 1px 0 rgba(0,0,0,.32)",
  elevation2: "0 1px 2px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.06)",
  elevation4: "0 2px 6px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.07)",
  elevation8: "0 6px 16px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.08)",
  elevation16: "0 12px 28px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.10)",
  elevation28: "0 20px 48px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.12)",
};

export const glassyLightShadows: AppThemeShadows = {
  panel: "inset 0 1px 0 rgba(255,255,255,.82), 0 1px 2px rgba(24,36,49,.08)",
  elevation2: "0 1px 3px rgba(24,36,49,.10), inset 0 1px 0 rgba(255,255,255,.70)",
  elevation4: "0 3px 8px rgba(24,36,49,.12), inset 0 1px 0 rgba(255,255,255,.74)",
  elevation8: "0 8px 20px rgba(24,36,49,.15), inset 0 1px 0 rgba(255,255,255,.78)",
  elevation16: "0 14px 32px rgba(24,36,49,.18), inset 0 1px 0 rgba(255,255,255,.82)",
  elevation28: "0 24px 52px rgba(24,36,49,.22), inset 0 1px 0 rgba(255,255,255,.86)",
};

export const glassyDarkMaterials: AppThemeMaterials = {
  chrome: {
    background: "rgba(13,20,32,0.78)",
    fallback: "#0d1420",
    backdropFilter: "blur(18px) saturate(120%)",
  },
  content: {
    background: "rgba(20,30,44,0.94)",
    fallback: "#141e2c",
  },
  overlay: {
    background: "rgba(20,30,44,0.90)",
    fallback: "#141e2c",
    backdropFilter: "blur(24px) saturate(125%)",
  },
  innerHighlight: "rgba(255,255,255,0.12)",
  scrim: "rgba(2,6,12,0.56)",
};

export const glassyLightMaterials: AppThemeMaterials = {
  chrome: {
    background: "rgba(247,250,253,0.78)",
    fallback: "#f7fafd",
    backdropFilter: "blur(18px) saturate(112%)",
  },
  content: {
    background: "rgba(240,245,250,0.94)",
    fallback: "#f0f5fa",
  },
  overlay: {
    background: "rgba(250,252,255,0.90)",
    fallback: "#f7fafd",
    backdropFilter: "blur(24px) saturate(115%)",
  },
  innerHighlight: "rgba(255,255,255,0.72)",
  scrim: "rgba(24,36,49,0.24)",
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
