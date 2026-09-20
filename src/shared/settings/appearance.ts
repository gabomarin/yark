/**
 * Appearance preference (Settings → Appearance, #PUX-004 Track B). Stored in
 * `app_settings` so the main process can read it too (splash / window chrome).
 *
 * The theme id is the registry key (`shared/theme/themes.ts`). An unknown or
 * missing value falls back to the default theme, so a downgrade, a hand-edited
 * row, or a theme that has not shipped yet can never leave the renderer without
 * a palette.
 */
export const THEME_IDS = ["dark"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** Product default - the shipped Paleo-Tech dark shell. */
export const DEFAULT_THEME_ID: ThemeId = "dark";

/** SQLite `app_settings.key` for the appearance preference JSON. */
export const APPEARANCE_SETTINGS_KEY = "appearance.v1";

export interface AppearanceSettings {
  theme: ThemeId;
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = { theme: DEFAULT_THEME_ID };

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function parseThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export function normalizeAppearanceSettings(input: Partial<AppearanceSettings>): AppearanceSettings {
  return { theme: parseThemeId(input.theme) };
}

export function parseAppearanceSettings(raw: string | null): AppearanceSettings {
  if (raw === null || raw.trim().length === 0) {
    return { ...DEFAULT_APPEARANCE_SETTINGS };
  }
  try {
    return normalizeAppearanceSettings(JSON.parse(raw) as Partial<AppearanceSettings>);
  } catch {
    return { ...DEFAULT_APPEARANCE_SETTINGS };
  }
}

export function encodeAppearanceSettings(settings: AppearanceSettings): string {
  return JSON.stringify(settings);
}
