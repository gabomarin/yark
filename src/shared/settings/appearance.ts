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
  theme: ThemeId;
  panels: WorkspacePanelsId;
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  theme: DEFAULT_THEME_ID,
  panels: DEFAULT_WORKSPACE_PANELS_ID,
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function parseThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export function isWorkspacePanelsId(value: unknown): value is WorkspacePanelsId {
  return typeof value === "string" && (WORKSPACE_PANELS_IDS as readonly string[]).includes(value);
}

export function parseWorkspacePanelsId(value: unknown): WorkspacePanelsId {
  return isWorkspacePanelsId(value) ? value : DEFAULT_WORKSPACE_PANELS_ID;
}

export function normalizeAppearanceSettings(input: Partial<AppearanceSettings>): AppearanceSettings {
  return { theme: parseThemeId(input.theme), panels: parseWorkspacePanelsId(input.panels) };
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
