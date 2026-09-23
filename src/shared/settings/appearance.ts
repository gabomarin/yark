/**
 * Appearance preference (Settings → Appearance, #PUX-004 Track B). Stored in
 * `app_settings` so the main process can read it too (splash / window chrome).
 *
 * Appearance stores a visual family and a light/dark scheme independently.
 * Unknown families fall back to the default family; unknown schemes (including
 * the legacy `theme` value) fall back to the default scheme.
 */
export const THEME_FAMILY_IDS = ["fluent", "plasma-breeze"] as const;
export const THEME_SCHEMES = ["dark", "light"] as const;

export type ThemeFamilyId = (typeof THEME_FAMILY_IDS)[number];
export type ThemeScheme = (typeof THEME_SCHEMES)[number];
export type ThemeSelection = {
  family: ThemeFamilyId;
  scheme: ThemeScheme;
};

/** Product default - the shipped Fluent dark shell. */
export const DEFAULT_THEME_FAMILY: ThemeFamilyId = "fluent";
export const DEFAULT_THEME_SCHEME: ThemeScheme = "dark";

/**
 * Server-workspace panels (`shared/workspace/workspacePanels.ts`). `auto` is the
 * shipped behaviour: the server list and the status panel take their own columns
 * when the window is wide enough, drawers when it is not. `drawers` never uses
 * columns.
 *
 * Note: an app-level *layout* (how the whole app is structured, not how the
 * server workspace arranges its panels) is a separate ticket.
 */
export const WORKSPACE_PANELS_IDS = ["auto", "drawers"] as const;

export type WorkspacePanelsId = (typeof WORKSPACE_PANELS_IDS)[number];

export const DEFAULT_WORKSPACE_PANELS_ID: WorkspacePanelsId = "auto";

/** SQLite `app_settings.key` for the appearance preference JSON. */
export const APPEARANCE_SETTINGS_KEY = "appearance.v1";

export interface AppearanceSettings {
  themeFamily: ThemeFamilyId;
  scheme: ThemeScheme;
  panels: WorkspacePanelsId;
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  themeFamily: DEFAULT_THEME_FAMILY,
  scheme: DEFAULT_THEME_SCHEME,
  panels: DEFAULT_WORKSPACE_PANELS_ID,
};

export function isThemeFamilyId(value: unknown): value is ThemeFamilyId {
  return typeof value === "string" && (THEME_FAMILY_IDS as readonly string[]).includes(value);
}

export function isThemeScheme(value: unknown): value is ThemeScheme {
  return typeof value === "string" && (THEME_SCHEMES as readonly string[]).includes(value);
}

export function isWorkspacePanelsId(value: unknown): value is WorkspacePanelsId {
  return typeof value === "string" && (WORKSPACE_PANELS_IDS as readonly string[]).includes(value);
}

export function parseWorkspacePanelsId(value: unknown): WorkspacePanelsId {
  return isWorkspacePanelsId(value) ? value : DEFAULT_WORKSPACE_PANELS_ID;
}

export function normalizeAppearanceSettings(
  input: Partial<AppearanceSettings> & { theme?: unknown },
): AppearanceSettings {
  const family = input.themeFamily;
  const scheme = input.scheme ?? input.theme;
  return {
    themeFamily: isThemeFamilyId(family) ? family : DEFAULT_THEME_FAMILY,
    scheme: isThemeScheme(scheme) ? scheme : DEFAULT_THEME_SCHEME,
    panels: parseWorkspacePanelsId(input.panels),
  };
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
  return JSON.stringify(normalizeAppearanceSettings(settings));
}
