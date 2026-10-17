import {
  DEFAULT_THEME_FAMILY,
  DEFAULT_THEME_SCHEME,
  THEME_SCHEMES,
  isThemeFamilyId,
  isThemeScheme,
  type ThemeFamilyId,
  type ThemeScheme,
  type ThemeSelection,
} from "@shared/settings/appearance";
import {
  darkColors,
  darkContrast,
  darkLadders,
  darkPalette,
  darkShadows,
  darkSurfaces,
  fluentRadius,
  fluentTypography,
  lightColors,
  lightContrast,
  lightLadders,
  lightPalette,
  lightShadows,
  lightSurfaces,
  glassyRadius,
  plasmaBreezeRadius,
  solidMaterials,
  type AppThemeColors,
  type AppThemeContrast,
  type AppThemeLadders,
  type AppThemeMaterials,
  type AppThemePalette,
  type AppThemeRadius,
  type AppThemeShadows,
  type AppThemeSurfaces,
  type AppThemeTypography,
} from "./tokens";
import {
  plasmaBreezeDarkColors,
  plasmaBreezeDarkContrast,
  plasmaBreezeDarkLadders,
  plasmaBreezeDarkPalette,
  plasmaBreezeDarkShadows,
  plasmaBreezeDarkSurfaces,
  plasmaBreezeLightColors,
  plasmaBreezeLightContrast,
  plasmaBreezeLightLadders,
  plasmaBreezeLightPalette,
  plasmaBreezeLightShadows,
  plasmaBreezeLightSurfaces,
  plasmaBreezeTypography,
} from "./plasmaBreezeTokens";
import {
  glassyDarkColors,
  glassyDarkContrast,
  glassyDarkLadders,
  glassyDarkMaterials,
  glassyDarkPalette,
  glassyDarkShadows,
  glassyDarkSurfaces,
  glassyLightColors,
  glassyLightContrast,
  glassyLightLadders,
  glassyLightMaterials,
  glassyLightPalette,
  glassyLightShadows,
  glassyLightSurfaces,
  glassyTypography,
} from "./glassyTokens";

/**
 * Theme registry (#PUX-004 Track B, #PUX-005-B, #PUX-005-A).
 *
 * A theme is a payload, never a second design system: the `--app-*` role map,
 * the density tokens and the motion tokens are shared, and feature CSS keeps
 * reading roles. An entry carries everything that genuinely differs per theme -
 * the palette (ramps, canvas, contrasts, alphas), the semantic colours, the
 * elevation ladder, the Mantine colour scales derived from those semantics, the
 * family typography profile, materials, and the family's documented contrast floors.
 */
export interface AppTheme {
  family: ThemeFamilyId;
  scheme: ThemeScheme;
  /** Component recipe family; each family owns its recipes and overrides. */
  recipeSet: "fluent" | "plasma-breeze" | "glassy";
  label: string;
  /** Mantine colour scheme the provider mounts for this theme. */
  colorScheme: "dark" | "light";
  palette: AppThemePalette;
  colors: AppThemeColors;
  shadows: AppThemeShadows;
  surfaces: AppThemeSurfaces;
  ladders: AppThemeLadders;
  typography: AppThemeTypography;
  /** Family radius ladder (comfortable scale); density scales it per run. */
  radius: AppThemeRadius;
  contrast: AppThemeContrast;
  materials: AppThemeMaterials;
}

export const THEME_FAMILIES: Readonly<Record<ThemeFamilyId, Readonly<Record<ThemeScheme, AppTheme>>>> = {
  fluent: {
    dark: {
      family: "fluent",
      scheme: "dark",
      recipeSet: "fluent",
      label: "Dark",
      colorScheme: "dark",
      palette: darkPalette,
      colors: darkColors,
      shadows: darkShadows,
      surfaces: darkSurfaces,
      ladders: darkLadders,
      typography: fluentTypography,
      radius: fluentRadius,
      contrast: darkContrast,
      materials: solidMaterials(darkPalette, {
        innerHighlight: "rgba(255, 255, 255, 0.06)",
        scrim: "rgba(0, 0, 0, 0.55)",
      }),
    },
    light: {
      family: "fluent",
      scheme: "light",
      recipeSet: "fluent",
      label: "Light",
      colorScheme: "light",
      palette: lightPalette,
      colors: lightColors,
      shadows: lightShadows,
      surfaces: lightSurfaces,
      ladders: lightLadders,
      typography: fluentTypography,
      radius: fluentRadius,
      contrast: lightContrast,
      materials: solidMaterials(lightPalette, {
        innerHighlight: "rgba(255, 255, 255, 0.82)",
        scrim: "rgba(16, 24, 40, 0.25)",
      }),
    },
  },
  "plasma-breeze": {
    dark: {
      family: "plasma-breeze",
      scheme: "dark",
      recipeSet: "plasma-breeze",
      label: "Breeze Dark",
      colorScheme: "dark",
      palette: plasmaBreezeDarkPalette,
      colors: plasmaBreezeDarkColors,
      shadows: plasmaBreezeDarkShadows,
      surfaces: plasmaBreezeDarkSurfaces,
      ladders: plasmaBreezeDarkLadders,
      typography: plasmaBreezeTypography,
      radius: plasmaBreezeRadius,
      contrast: plasmaBreezeDarkContrast,
      materials: solidMaterials(plasmaBreezeDarkPalette, {
        innerHighlight: "rgba(255, 255, 255, 0.05)",
        scrim: "rgba(0, 0, 0, 0.55)",
      }),
    },
    light: {
      family: "plasma-breeze",
      scheme: "light",
      recipeSet: "plasma-breeze",
      label: "Breeze Light",
      colorScheme: "light",
      palette: plasmaBreezeLightPalette,
      colors: plasmaBreezeLightColors,
      shadows: plasmaBreezeLightShadows,
      surfaces: plasmaBreezeLightSurfaces,
      ladders: plasmaBreezeLightLadders,
      typography: plasmaBreezeTypography,
      radius: plasmaBreezeRadius,
      contrast: plasmaBreezeLightContrast,
      materials: solidMaterials(plasmaBreezeLightPalette, {
        innerHighlight: "rgba(255, 255, 255, 0.82)",
        scrim: "rgba(16, 24, 40, 0.25)",
      }),
    },
  },
  glassy: {
    dark: {
      family: "glassy",
      scheme: "dark",
      recipeSet: "glassy",
      label: "Glassy Dark",
      colorScheme: "dark",
      palette: glassyDarkPalette,
      colors: glassyDarkColors,
      shadows: glassyDarkShadows,
      surfaces: glassyDarkSurfaces,
      ladders: glassyDarkLadders,
      typography: glassyTypography,
      radius: glassyRadius,
      contrast: glassyDarkContrast,
      materials: glassyDarkMaterials,
    },
    light: {
      family: "glassy",
      scheme: "light",
      recipeSet: "glassy",
      label: "Glassy Light",
      colorScheme: "light",
      palette: glassyLightPalette,
      colors: glassyLightColors,
      shadows: glassyLightShadows,
      surfaces: glassyLightSurfaces,
      ladders: glassyLightLadders,
      typography: glassyTypography,
      radius: glassyRadius,
      contrast: glassyLightContrast,
      materials: glassyLightMaterials,
    },
  },
};

/** Human labels for the Appearance family control, in registry order. */
export const THEME_FAMILY_LIST: ReadonlyArray<{ id: ThemeFamilyId; label: string }> = [
  { id: "fluent", label: "Fluent" },
  { id: "plasma-breeze", label: "Plasma Breeze" },
  { id: "glassy", label: "Glassy" },
];

/**
 * Flat compatibility view for callers that still enumerate the shipped variants.
 * @deprecated This view is pinned to Fluent; use THEME_FAMILIES and resolveThemeSelection.
 */
export const THEMES: Readonly<Record<ThemeScheme, AppTheme>> = THEME_FAMILIES.fluent;

/** Registry order = the order the Appearance control lists them in. */
export const APP_THEME_LIST: readonly AppTheme[] = THEME_SCHEMES.map(
  (scheme) => THEME_FAMILIES[DEFAULT_THEME_FAMILY][scheme],
);

/**
 * Every shipped variant across every family, in registry order. The token,
 * contrast and semantic gates iterate this instead of the Fluent-pinned
 * `APP_THEME_LIST`, so a new family cannot ship without running them.
 */
export const ALL_APP_THEMES: readonly AppTheme[] = Object.values(THEME_FAMILIES).flatMap((family) =>
  THEME_SCHEMES.map((scheme) => family[scheme]),
);

/** Variants of one family, in scheme order, for the Appearance scheme control. */
export function themeVariantsForFamily(family: ThemeFamilyId): readonly AppTheme[] {
  return THEME_SCHEMES.map((scheme) => THEME_FAMILIES[family][scheme]);
}

export const DEFAULT_APP_THEME: AppTheme = THEME_FAMILIES[DEFAULT_THEME_FAMILY][DEFAULT_THEME_SCHEME];

export function resolveThemeSelection(selection: ThemeSelection | null | undefined): AppTheme {
  if (selection !== null && selection !== undefined && isThemeFamilyId(selection.family)) {
    const family = THEME_FAMILIES[selection.family];
    return family[isThemeScheme(selection.scheme) ? selection.scheme : DEFAULT_THEME_SCHEME];
  }
  return DEFAULT_APP_THEME;
}
