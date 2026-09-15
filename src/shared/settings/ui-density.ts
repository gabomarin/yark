/** UI density preference (Settings → General). Stored in `app_settings`. */
export type UiDensity = "comfortable" | "compact";

/** SQLite `app_settings.key` for the density preference. */
export const UI_DENSITY_SETTING_KEY = "uiDensity";

/** Product default — Compact. */
export const DEFAULT_UI_DENSITY: UiDensity = "compact";

/** Legacy renderer localStorage key (migrated once into `app_settings`). */
export const UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY = "settings.uiDensity";

export function isUiDensity(value: string | null | undefined): value is UiDensity {
  return value === "comfortable" || value === "compact";
}

export function parseUiDensity(value: string | null | undefined): UiDensity {
  return isUiDensity(value) ? value : DEFAULT_UI_DENSITY;
}
