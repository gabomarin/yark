import { DEFAULT_THEME_SCHEME, parseAppearanceSettings, type ThemeScheme } from "./settings/appearance";

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

/*
 * Crash-screen literals. The boundary renders when the providers themselves are what threw, so
 * it cannot read `--app-color-*` (the Mantine resolver may never have run). They are the dark
 * ramp's steps 12 / 11 and the canvas - kept here, next to the canvas constant, so a palette
 * change has one place to update and `app-chrome.test.ts` can fail if they drift from the
 * rendered ramp instead of relying on someone noticing.
 */
export const ERROR_SCREEN_BACKGROUND = "#010306";
export const ERROR_SCREEN_TEXT = "#e6effd";
export const ERROR_SCREEN_MUTED = "#aabedb";

const BOOTSTRAP_BACKGROUNDS: Record<ThemeScheme, string> = {
  dark: "#010306",
  light: "#dce0e6",
};

/** Canvas of the shipped default theme (the dark palette's `background`). */
export const BOOTSTRAP_BACKGROUND = BOOTSTRAP_BACKGROUNDS[DEFAULT_THEME_SCHEME];

/** Canvas for a theme id. */
export function bootstrapBackgroundFor(scheme: ThemeScheme): string {
  return BOOTSTRAP_BACKGROUNDS[scheme];
}

/**
 * Canvas for the stored appearance JSON - what the main process has before it hands the
 * window over. A missing, hand-edited or unknown value falls back to the default theme.
 */
export function bootstrapBackgroundFromStored(raw: string | null): string {
  return bootstrapBackgroundFor(parseAppearanceSettings(raw).scheme);
}
