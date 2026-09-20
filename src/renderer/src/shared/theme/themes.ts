import { DEFAULT_THEME_ID, THEME_IDS, isThemeId, type ThemeId } from "@shared/settings/appearance";
import { radixPalette, type AppThemePalette } from "./tokens";

/**
 * Theme registry (#PUX-004 Track B).
 *
 * A theme is a palette, never a second design system: the `--app-*` role map,
 * the semantic colours (ok / attention / fossil / danger), radii, spacing and
 * motion are shared, and feature CSS keeps reading roles instead of palette
 * steps. Adding a theme is one entry here plus its palette - no third copy of
 * the colour language.
 */
export interface AppTheme {
  id: ThemeId;
  label: string;
  /** Mantine colour scheme the provider mounts for this theme. */
  colorScheme: "dark" | "light";
  palette: AppThemePalette;
}

export const THEMES: Readonly<Record<ThemeId, AppTheme>> = {
  dark: {
    id: "dark",
    label: "Dark",
    colorScheme: "dark",
    palette: radixPalette,
  },
};

/** Registry order = the order the Appearance control lists them in. */
export const APP_THEME_LIST: readonly AppTheme[] = THEME_IDS.map((id) => THEMES[id]);

export const DEFAULT_APP_THEME: AppTheme = THEMES[DEFAULT_THEME_ID];

export function resolveAppTheme(id: string | null | undefined): AppTheme {
  return isThemeId(id) ? THEMES[id] : DEFAULT_APP_THEME;
}
