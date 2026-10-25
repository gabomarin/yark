import catalogJson from "./asa-item-catalog.json";

/** Official ASA item class for the Game.ini loot picker. */
export interface AsaItemEntry {
  className: string;
  label: string;
  /** Picker filter. Not an INI field. */
  kind: "resource" | "weapon" | "armor" | "structure" | "item";
  /**
   * Server map tokens where this catalog places the item.
   * Empty means the catalog does not limit the item to a map.
   */
  maps: string[];
}

interface AsaItemCatalog {
  version: string;
  generatedAt: string;
  source: { note: string };
  count: number;
  entries: AsaItemEntry[];
}

const catalog = catalogJson as AsaItemCatalog;

export const asaItemCatalog: AsaItemCatalog = catalog;

export const asaItemEntries: readonly AsaItemEntry[] = catalog.entries;

const byClass = new Map(asaItemEntries.map((entry) => [entry.className.toLowerCase(), entry] as const));

export function lookupAsaItem(className: string): AsaItemEntry | undefined {
  return byClass.get(className.trim().toLowerCase());
}
