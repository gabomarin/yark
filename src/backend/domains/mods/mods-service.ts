import type { ModMetadata } from "@shared/types";
import {
  MOCK_MOD_CATALOG,
  buildPlaceholderMetadata,
} from "./mock-mod-catalog";

/**
 * Resolves mod metadata.
 * Today: hardcoded catalog + placeholder.
 * Later: replace getMod/getMods body with official CurseForge (API key).
 */
export class ModsService {
  async getMod(modId: string, _options?: { forceRefresh?: boolean }): Promise<ModMetadata> {
    const id = normalizeModId(modId);
    return MOCK_MOD_CATALOG[id] ?? buildPlaceholderMetadata(id);
  }

  async getMods(
    modIds: string[],
    options?: { forceRefresh?: boolean },
  ): Promise<ModMetadata[]> {
    const unique = [...new Set(modIds.map(normalizeModId))];
    const result: ModMetadata[] = [];
    for (const id of unique) {
      result.push(await this.getMod(id, options));
    }
    return result;
  }
}

export function normalizeModId(raw: string): string {
  const id = raw.trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(
      `Invalid mod ID: "${raw}". Use the numeric CurseForge Project ID.`,
    );
  }
  return id;
}
