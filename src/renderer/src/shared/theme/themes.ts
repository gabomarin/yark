import { DEFAULT_THEME_ID, THEME_IDS, isThemeId, type ThemeId } from "@shared/settings/appearance";
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
  id: ThemeId;
  label: string;
  /** Mantine colour scheme the provider mounts for this theme. */
  colorScheme: "dark" | "light";
  palette: AppThemePalette;
  colors: AppThemeColors;
  shadows: AppThemeShadows;
  surfaces: AppThemeSurfaces;
  ladders: AppThemeLadders;
}

export const THEMES: Readonly<Record<ThemeId, AppTheme>> = {
  dark: {
    id: "dark",
    label: "Dark",
    colorScheme: "dark",
    palette: darkPalette,
    colors: darkColors,
    shadows: darkShadows,
    surfaces: darkSurfaces,
    ladders: darkLadders,
  },
  light: {
    id: "light",
    label: "Light",
    colorScheme: "light",
    palette: lightPalette,
    colors: lightColors,
    shadows: lightShadows,
    surfaces: lightSurfaces,
    ladders: lightLadders,
  },
};

/** Registry order = the order the Appearance control lists them in. */
export const APP_THEME_LIST: readonly AppTheme[] = THEME_IDS.map((id) => THEMES[id]);

export const DEFAULT_APP_THEME: AppTheme = THEMES[DEFAULT_THEME_ID];

export function resolveAppTheme(id: string | null | undefined): AppTheme {
  return isThemeId(id) ? THEMES[id] : DEFAULT_APP_THEME;
}
