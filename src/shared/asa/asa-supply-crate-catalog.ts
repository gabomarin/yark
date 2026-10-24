/** A sample of official ASA supply crates. Not a full loot-table dump. */

import { KNOWN_MAPS } from "../types";

export type SupplyCrateFit = "active" | "shared" | "unused" | "unknown";

export interface SupplyCrateCatalogEntry {
  className: string;
  label: string;
  kind: "level" | "cave";
}

const CAVE_MAPS = new Set(["TheIsland_WP", "TheCenter_WP", "Ragnarok_WP", "Valguero_WP"]);
const KNOWN = new Set<string>(KNOWN_MAPS);

const CATALOG: readonly SupplyCrateCatalogEntry[] = [
  { className: "SupplyCrate_Level03_C", label: "White supply crate", kind: "level" },
  { className: "SupplyCrate_Level15_C", label: "Green supply crate", kind: "level" },
  { className: "SupplyCrate_Level25_C", label: "Blue supply crate", kind: "level" },
  { className: "SupplyCrate_Level35_C", label: "Purple supply crate", kind: "level" },
  { className: "SupplyCrate_Level45_C", label: "Yellow supply crate", kind: "level" },
  { className: "SupplyCrate_Level60_C", label: "Red supply crate", kind: "level" },
  { className: "SupplyCrate_Cave_QualityTier1_C", label: "Cave crate tier 1", kind: "cave" },
  { className: "SupplyCrate_Cave_QualityTier2_C", label: "Cave crate tier 2", kind: "cave" },
  { className: "SupplyCrate_Cave_QualityTier3_C", label: "Cave crate tier 3", kind: "cave" },
];

export function supplyCrateCatalog(): readonly SupplyCrateCatalogEntry[] {
  return CATALOG;
}

export function lookupSupplyCrate(className: string): SupplyCrateCatalogEntry | undefined {
  const key = className.trim().toLowerCase();
  return CATALOG.find((entry) => entry.className.toLowerCase() === key);
}

/**
 * Level crates are shared on surface maps and unused on Aberration.
 * Cave tiers are active on The Island, The Center, Ragnarok, and Valguero.
 * A class or map outside this sample is unknown and stays editable.
 */
export function supplyCrateFit(className: string, map: string): SupplyCrateFit {
  const entry = lookupSupplyCrate(className);
  if (entry === undefined || !KNOWN.has(map)) return "unknown";
  if (entry.kind === "level") return map === "Aberration_WP" ? "unused" : "shared";
  return CAVE_MAPS.has(map) ? "active" : "unused";
}

export function supplyCrateFitLabel(fit: SupplyCrateFit): string {
  if (fit === "active") return "Active";
  if (fit === "shared") return "Shared";
  if (fit === "unused") return "Unused";
  return "Unknown";
}

export function supplyCrateRemovable(fit: SupplyCrateFit): boolean {
  return fit === "unused" || fit === "unknown";
}
