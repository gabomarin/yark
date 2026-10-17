import type { IniMetaFileKey } from "./ini-setting-meta";
import { lookupIniSettingMeta } from "./ini-setting-meta";
import { lookupAbsencePolicy } from "./ini-setting-decisions";

/**
 * Saved-value relation to a verified ASA catalog default (PINI-002 / #663).
 * Distinct from unsaved draft highlighting (PINI-001).
 */
export type IniCatalogRelation = "custom" | "default" | "unset" | "unknown";

export interface VerifiedIniDefault {
  value: string;
  source: string;
  reviewedAt: string;
}

/**
 * Resolve Custom / Default / Unset / Unknown from the saved value and an optional
 * verified catalog default. Inferred project defaults must not be passed here.
 */
export function resolveIniCatalogRelation(
  savedValue: string | null,
  verifiedDefault: string | null,
): IniCatalogRelation {
  if (savedValue === null) return "unset";
  if (verifiedDefault === null) return "unknown";
  return savedValue === verifiedDefault ? "default" : "custom";
}

export function catalogRelationLabel(relation: IniCatalogRelation): string {
  switch (relation) {
    case "custom":
      return "Custom";
    case "default":
      return "Default";
    case "unset":
      return "Unset";
    case "unknown":
      return "Unknown";
  }
}

/** Verified ASA default only — never inferred `defaults-catalog` rows. */
export function lookupVerifiedIniDefault(
  file: IniMetaFileKey,
  section: string,
  key: string,
): VerifiedIniDefault | null {
  const meta = lookupIniSettingMeta(file, section, key);
  if (meta === undefined) return null;
  if (meta.owner !== "iniVisual") return null;
  if (meta.provenance.confidence !== "verified") return null;
  if (meta.provenance.reviewedAt === null || meta.provenance.reviewedAt.trim().length === 0) {
    return null;
  }
  return {
    value: meta.defaultValue,
    source: meta.provenance.source,
    reviewedAt: meta.provenance.reviewedAt,
  };
}

export function canUnsetIniSetting(file: IniMetaFileKey, section: string, key: string): boolean {
  return lookupAbsencePolicy(file, section, key) === "allowed";
}
