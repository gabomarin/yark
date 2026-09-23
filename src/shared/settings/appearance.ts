/**
 * Appearance preference (Settings → Appearance, #PUX-004 Track B). Stored in
 * `app_settings` so the main process can read it too (splash / window chrome).
 *
 * The theme id is the registry key (`shared/theme/themes.ts`). An unknown or
 * missing value falls back to the default theme, so a downgrade, a hand-edited
 * row, or a theme that has not shipped yet can never leave the renderer without
 * a palette.
 */
export const THEME_FAMILY_IDS = ["fluent"] as const;
export const THEME_SCHEMES = ["dark", "light"] as const;
/** Backward-compatible registry name for the former scheme ids. */
export const THEME_IDS = THEME_SCHEMES;

export type ThemeFamilyId = (typeof THEME_FAMILY_IDS)[number];
export type ThemeScheme = (typeof THEME_SCHEMES)[number];
export type ThemeSelection = {
  family: ThemeFamilyId;
  scheme: ThemeScheme;
};

/** Backward-compatible alias for callers that only handled the old scheme id. */
export type ThemeId = ThemeScheme;

/** Product default - the shipped Fluent dark shell. */
export const DEFAULT_THEME_FAMILY: ThemeFamilyId = "fluent";
export const DEFAULT_THEME_SCHEME: ThemeScheme = "dark";
/** Backward-compatible default for the former combined theme id. */
export const DEFAULT_THEME_ID: ThemeId = DEFAULT_THEME_SCHEME;

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

export function isThemeId(value: unknown): value is ThemeId {
  return isThemeScheme(value);
}

export function parseThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export function isThemeFamilyId(value: unknown): value is ThemeFamilyId {
  return typeof value === "string" && (THEME_FAMILY_IDS as readonly string[]).includes(value);
}

export function parseThemeFamilyId(value: unknown): ThemeFamilyId {
  return isThemeFamilyId(value) ? value : DEFAULT_THEME_FAMILY;
}

export function isThemeScheme(value: unknown): value is ThemeScheme {
  return typeof value === "string" && (THEME_SCHEMES as readonly string[]).includes(value);
}

export function parseThemeScheme(value: unknown): ThemeScheme {
  return isThemeScheme(value) ? value : DEFAULT_THEME_SCHEME;
}

export function isWorkspacePanelsId(value: unknown): value is WorkspacePanelsId {
  return typeof value === "string" && (WORKSPACE_PANELS_IDS as readonly string[]).includes(value);
}

export function parseWorkspacePanelsId(value: unknown): WorkspacePanelsId {
  return isWorkspacePanelsId(value) ? value : DEFAULT_WORKSPACE_PANELS_ID;
}

export function normalizeAppearanceSettings(
  input: Partial<AppearanceSettings> & { theme?: unknown; family?: unknown },
): AppearanceSettings {
  return {
    themeFamily: parseThemeFamilyId(input.themeFamily ?? input.family),
    scheme: parseThemeScheme(input.scheme ?? input.theme),
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
