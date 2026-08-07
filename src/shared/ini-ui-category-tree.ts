/**
 * Build the same ASA UI category tree the INI editor uses, for a single INI file.
 */

import {
  ASA_UI_CATEGORIES,
  asaUiCategoryLabel,
  resolveAsaUiCategory,
  type AsaUiCategoryId,
} from "./asa-setting-ui-categories";
import { isClientIniNoise, parseIniTextRows } from "./ini-text";
import { isYarkOwnedIniKey } from "./yark-owned-ini-keys";

export type IniUiFileKey = "gameUserSettings" | "game";

export interface IniUiCategoryKey {
  section: string;
  key: string;
}

export interface IniUiCategoryGroup {
  id: AsaUiCategoryId;
  label: string;
  keys: IniUiCategoryKey[];
}

export interface ListIniUiCategoryTreeOptions {
  /** Drop YARK-owned GameUserSettings keys (ports, passwords, session, …). */
  excludeOwnedGusKeys?: boolean;
}

/**
 * Group present INI keys into ASA UI categories (Breeding, Rates, …),
 * matching the server Configuration editor taxonomy and order.
 */
export function listIniUiCategoryTree(
  text: string,
  fileKey: IniUiFileKey,
  options: ListIniUiCategoryTreeOptions = {},
): IniUiCategoryGroup[] {
  const buckets = new Map<AsaUiCategoryId, IniUiCategoryKey[]>();
  const seen = new Set<string>();

  for (const row of parseIniTextRows(text)) {
    if (isClientIniNoise(row.section, row.key)) continue;
    if (
      options.excludeOwnedGusKeys === true &&
      fileKey === "gameUserSettings" &&
      isYarkOwnedIniKey(row.section, row.key)
    ) {
      continue;
    }
    const identity = `${row.section.toLowerCase()}\0${row.key.toLowerCase()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const category = resolveAsaUiCategory(fileKey, row.section, row.key);
    const list = buckets.get(category);
    const entry = { section: row.section, key: row.key };
    if (list !== undefined) list.push(entry);
    else buckets.set(category, [entry]);
  }

  const groups: IniUiCategoryGroup[] = [];
  for (const def of ASA_UI_CATEGORIES) {
    const list = buckets.get(def.id);
    if (list === undefined || list.length === 0) continue;
    list.sort(
      (a, b) =>
        a.key.localeCompare(b.key) || a.section.localeCompare(b.section),
    );
    groups.push({
      id: def.id,
      label: asaUiCategoryLabel(def.id),
      keys: list,
    });
  }
  return groups;
}
