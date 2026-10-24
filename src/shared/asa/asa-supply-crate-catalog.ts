/** Supply and loot crate classes from the ARK wiki Beacon IDs list. */

import { formatMapDisplayName } from "./map-identity";
import { KNOWN_MAPS } from "../types";
import catalogJson from "./asa-supply-crate-catalog.json";

export type SupplyCrateFit = "active" | "shared" | "unused" | "unknown";

export interface SupplyCrateCatalogEntry {
  className: string;
  label: string;
  /** Island colored drops, their ring drops, and the shared cave tiers keep their own sentences. */
  kind: "level" | "ring" | "cave" | "drop";
  /** YARK map tokens where this crate is used. Empty means the beacon list does not tie it to one. */
  maps: string[];
}

interface SupplyCrateCatalogFile {
  version: string;
  generatedAt: string;
  source: { note: string };
  count: number;
  entries: SupplyCrateCatalogEntry[];
}

const catalog = catalogJson as SupplyCrateCatalogFile;
const CATALOG: readonly SupplyCrateCatalogEntry[] = catalog.entries;
const KNOWN = new Set<string>(KNOWN_MAPS);
const byClass = new Map(CATALOG.map((entry) => [entry.className.toLowerCase(), entry] as const));

export function supplyCrateCatalog(): readonly SupplyCrateCatalogEntry[] {
  return CATALOG;
}

export function lookupSupplyCrate(className: string): SupplyCrateCatalogEntry | undefined {
  return byClass.get(className.trim().toLowerCase());
}

/**
 * A crate used on this map is active when it is the only map, or when it is one of the shared cave tiers.
 * A crate used on several maps is shared. A listed crate this map does not use is unused.
 * A class or map outside the list is unknown and stays editable.
 */
export function supplyCrateFit(className: string, map: string): SupplyCrateFit {
  const entry = lookupSupplyCrate(className);
  if (entry === undefined || !KNOWN.has(map)) return "unknown";
  if (!entry.maps.includes(map)) return "unused";
  if (entry.kind === "cave" || entry.maps.length === 1) return "active";
  return "shared";
}

export function supplyCrateFitLabel(fit: SupplyCrateFit): string {
  if (fit === "active") return "Active";
  if (fit === "shared") return "Shared";
  if (fit === "unused") return "Unused";
  return "Unknown";
}

function mapList(maps: readonly string[]): string {
  const names = maps.map((map) => formatMapDisplayName(map));
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function isRingClass(className: string): boolean {
  return className.toLowerCase().includes("_double");
}

function plainHasRing(className: string): boolean {
  const lower = className.toLowerCase();
  const candidates = [
    lower.replace(/_c$/, "_double_c"),
    lower.replace(/_scorchedearth_c$/, "_double_scorchedearth_c"),
    lower.replace(/_lostisland_c$/, "_double_lostisland_c"),
  ];
  return candidates.some((name) => name !== lower && byClass.has(name));
}

function ringNote(className: string): string {
  if (isRingClass(className)) {
    return " The crate without a ring is a separate line and keeps the game's loot until you edit it.";
  }
  if (plainHasRing(className)) {
    return " The ring drop is a separate class and keeps the game's loot until you edit it.";
  }
  return "";
}

/** One note for the badge, naming the server map. */
export function supplyCrateFitHint(className: string, map: string): string {
  const place = formatMapDisplayName(map);
  const entry = lookupSupplyCrate(className);
  const fit = supplyCrateFit(className, map);
  const kind = entry?.kind;
  if (fit === "shared" && kind === "ring" && entry !== undefined) {
    return `Ring drop used on ${mapList(entry.maps)}. The crate without a ring is a separate line and keeps the game's loot until you edit it.`;
  }
  if (fit === "shared" && kind === "level" && entry !== undefined) {
    return `Colored drop used on ${mapList(entry.maps)}. The ring drop is a separate class and keeps the game's loot until you edit it.`;
  }
  if (fit === "active" && kind === "cave") return `Cave crate used on ${place}.`;
  if (fit === "unused" && kind === "ring") {
    return `Ring drops are not used on ${place}. This override stays until you remove it.`;
  }
  if (fit === "unused" && kind === "level") {
    return `Colored drops are not used on ${place}. This override stays until you remove it.`;
  }
  if (fit === "unused" && kind === "cave") {
    return `This cave crate is not used on ${place}. This override stays until you remove it.`;
  }
  if (entry === undefined || fit === "unknown") {
    return `This class is not in the crate list, or ${place} is not a map YARK knows. You can still edit it.`;
  }
  if (fit === "unused") {
    if (entry.maps.length === 0) {
      return `${entry.label} is not used on ${place}. The beacon list does not tie it to a map YARK knows. This override stays until you remove it.`;
    }
    return `${entry.label} is not used on ${place}. This override stays until you remove it.`;
  }
  const where = entry.maps.length === 1 ? place : mapList(entry.maps);
  return `${entry.label} used on ${where}.${ringNote(entry.className)}`;
}

export function supplyCrateRemovable(fit: SupplyCrateFit): boolean {
  return fit === "unused" || fit === "unknown";
}
