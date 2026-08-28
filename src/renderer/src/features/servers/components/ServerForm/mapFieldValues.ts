/** Sentinel for free-form ASA Map Name (#65 / #191). */
export const CUSTOM_MAP_SELECT_VALUE = "__yark_custom_map__";

/** Select value prefix for an enabled Maps-category mod (#192). */
const MAP_MOD_SELECT_PREFIX = "mapmod:";

export function mapModSelectValue(modId: string): string {
  return `${MAP_MOD_SELECT_PREFIX}${modId}`;
}

export function parseMapModSelectValue(value: string): string | null {
  if (!value.startsWith(MAP_MOD_SELECT_PREFIX)) {
    return null;
  }
  const id = value.slice(MAP_MOD_SELECT_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}
