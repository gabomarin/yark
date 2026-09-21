import { DEFAULT_THEME_ID, parseAppearanceSettings, type ThemeId } from "./settings/appearance";

/**
 * Colours the app paints before the renderer's first frame.
 *
 * Two surfaces, two rules:
 *
 * - The **canvas** is what the operator sees behind the window, so it follows the theme
 *   (`--app-color-bg`): a dark canvas behind a light shell flashes black on startup and on
 *   every resize, which is exactly the jump this module exists to prevent.
 * - The **brand plate** is the navy the light-on-dark lockup sits on (the splash document and
 *   the sidebar's plate), so it stays the same in both themes.
 *
 * Everything here is shared with the renderer: the dark canvas is `darkPalette.background` and
 * the plate is `--app-brand-plate`, so a mismatch cannot creep in on one side only.
 */

/** Navy behind the brand lockup - the splash document and the sidebar plate. */
export const BRAND_PLATE_BACKGROUND = "#0d1526";

const BOOTSTRAP_BACKGROUNDS: Record<ThemeId, string> = {
  dark: "#010306",
  light: "#dce0e6",
};

/** Canvas of the shipped default theme (the dark palette's `background`). */
export const BOOTSTRAP_BACKGROUND = BOOTSTRAP_BACKGROUNDS[DEFAULT_THEME_ID];

/** Canvas for a theme id. */
export function bootstrapBackgroundFor(theme: ThemeId): string {
  return BOOTSTRAP_BACKGROUNDS[theme];
}

/**
 * Canvas for the stored appearance JSON - what the main process has before it hands the
 * window over. A missing, hand-edited or unknown value falls back to the default theme.
 */
export function bootstrapBackgroundFromStored(raw: string | null): string {
  return bootstrapBackgroundFor(parseAppearanceSettings(raw).theme);
}
