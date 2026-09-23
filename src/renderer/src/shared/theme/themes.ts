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
  darkLadders,
  darkPalette,
  darkShadows,
  darkSurfaces,
  lightColors,
  lightLadders,
  lightPalette,
  lightShadows,
  lightSurfaces,
  type AppThemeColors,
  type AppThemeLadders,
  type AppThemePalette,
  type AppThemeShadows,
  type AppThemeSurfaces,
} from "./tokens";

/**
 * Theme registry (#PUX-004 Track B).
 *
 * A theme is a payload, never a second design system: the `--app-*` role map,
 * the density tokens and the motion tokens are shared, and feature CSS keeps
 * reading roles. An entry carries everything that genuinely differs per theme -
 * the palette (ramps, canvas, contrasts, alphas), the semantic colours, the
 * elevation ladder and the Mantine colour scales derived from those semantics.
 */
export interface AppTheme {
  family: ThemeFamilyId;
  scheme: ThemeScheme;
  /** Component recipe family; kept separate from semantic tokens for future families. */
  recipeSet: "fluent";
  label: string;
  /** Mantine colour scheme the provider mounts for this theme. */
  colorScheme: "dark" | "light";
  palette: AppThemePalette;
  colors: AppThemeColors;
  shadows: AppThemeShadows;
  surfaces: AppThemeSurfaces;
  ladders: AppThemeLadders;
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
    },
  },
};

/**
 * Flat compatibility view for callers that still enumerate the shipped variants.
 * @deprecated This view is pinned to Fluent; use THEME_FAMILIES and resolveThemeSelection.
 */
export const THEMES: Readonly<Record<ThemeScheme, AppTheme>> = THEME_FAMILIES.fluent;

/** Registry order = the order the Appearance control lists them in. */
export const APP_THEME_LIST: readonly AppTheme[] = THEME_SCHEMES.map((scheme) => THEMES[scheme]);

export const DEFAULT_APP_THEME: AppTheme = THEME_FAMILIES[DEFAULT_THEME_FAMILY][DEFAULT_THEME_SCHEME];

export function resolveThemeSelection(selection: ThemeSelection | string | null | undefined): AppTheme {
  if (typeof selection === "string") {
    return isThemeScheme(selection) ? THEMES[selection] : DEFAULT_APP_THEME;
  }
  if (selection !== null && selection !== undefined && isThemeFamilyId(selection.family)) {
    const family = THEME_FAMILIES[selection.family];
    return family[isThemeScheme(selection.scheme) ? selection.scheme : DEFAULT_THEME_SCHEME];
  }
  return DEFAULT_APP_THEME;
}

/** @deprecated Compatibility resolver for the former combined theme id. */
export function resolveAppTheme(id: string | null | undefined): AppTheme {
  return resolveThemeSelection(id);
}
