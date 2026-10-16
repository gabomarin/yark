/**
 * Central ownership / absence / enforcement / visual-editability decisions
 * for INI settings (PINI-016 / #659).
 *
 * Catalog metadata is the source for known settings. MaxPlayers and client
 * noise remain policy helpers composed here so consumers share one path.
 */

import {
  iniSettingMetaList,
  lookupIniSettingMeta,
  type IniMetaFileKey,
  type IniSettingAbsencePolicy,
  type IniSettingEnforcement,
  type IniSettingOwner,
  type IniSettingProvenance,
} from "./ini-setting-meta";
import { isClientIniNoise } from "./ini-text";
import ownershipSeed from "./ini-setting-ownership-seed.json";

const OWNERS = new Set<IniSettingOwner>(["serverProfile", "iniVisual", "externalManual", "system"]);
const ABSENCE_POLICIES = new Set<IniSettingAbsencePolicy>(["allowed", "forbidden", "mapsToProfileNull"]);
const ENFORCEMENTS = new Set<IniSettingEnforcement>(["blocking", "warning", "advisory"]);
const CONFIDENCES = new Set(["verified", "inferred", "unknown"]);

/** ASA ignores INI MaxPlayers; the live cap is `-WinLiveMaxPlayers`. */
export function isAsaIgnoredIniMaxPlayers(key: string): boolean {
  return key.trim().toLowerCase() === "maxplayers";
}

export type IniSettingPresenceKind = "knownSupported" | "profileOwned" | "systemOwned" | "unknown" | "absent";

/**
 * Import / sync contract for PINI-004 / PINI-010 / PINI-011 consumers.
 * This ticket exposes the decisions only; full import UI is out of scope.
 */
export const INI_IMPORT_PRECEDENCE = {
  /** After intentional profile synchronization, profile values win for serverProfile-owned keys. */
  profileAuthoritativeAfterSync: true,
  /** Raw INI occurrences remain preserved until that synchronization is intentional. */
  preserveRawUntilIntentionalSync: true,
  /** Conflicts are reported instead of silently treated as independent visual settings. */
  reportConflicts: true,
  /** Absence is not equivalent to applying a catalog default. */
  absenceIsNotCatalogDefault: true,
} as const;

export function lookupSettingOwner(file: IniMetaFileKey, section: string, key: string): IniSettingOwner | "unknown" {
  return lookupIniSettingMeta(file, section, key)?.owner ?? "unknown";
}

export function lookupAbsencePolicy(
  file: IniMetaFileKey,
  section: string,
  key: string,
): IniSettingAbsencePolicy | "unknown" {
  return lookupIniSettingMeta(file, section, key)?.absencePolicy ?? "unknown";
}

export function lookupEnforcement(
  file: IniMetaFileKey,
  section: string,
  key: string,
): IniSettingEnforcement | "unknown" {
  return lookupIniSettingMeta(file, section, key)?.enforcement ?? "unknown";
}

export function lookupProvenance(file: IniMetaFileKey, section: string, key: string): IniSettingProvenance | null {
  return lookupIniSettingMeta(file, section, key)?.provenance ?? null;
}

/**
 * True when the GameUserSettings section/key is YARK-owned for strip/sync
 * (profileSync or aseLegacy). MaxPlayers is intentionally excluded.
 */
export function isCatalogOwnedIniKey(section: string, key: string): boolean {
  const meta = lookupIniSettingMeta("gameUserSettings", section, key);
  if (!meta) return false;
  return meta.owner === "serverProfile" || meta.owner === "system";
}

/**
 * Whether the Configuration / template visual editor may present this key as
 * an independently editable INI setting.
 */
export function isVisuallyEditableIniSetting(file: IniMetaFileKey, section: string, key: string): boolean {
  if (isClientIniNoise(section, key)) {
    return false;
  }
  if (isAsaIgnoredIniMaxPlayers(key)) {
    return false;
  }
  if (file === "gameUserSettings" && isCatalogOwnedIniKey(section, key)) {
    return false;
  }
  return true;
}

export function classifyIniSettingPresence(
  file: IniMetaFileKey,
  section: string,
  key: string,
  present: boolean,
): IniSettingPresenceKind {
  if (!present) {
    return "absent";
  }
  const meta = lookupIniSettingMeta(file, section, key);
  if (!meta) {
    return "unknown";
  }
  if (meta.owner === "serverProfile") {
    return "profileOwned";
  }
  if (meta.owner === "system") {
    return "systemOwned";
  }
  return "knownSupported";
}

export interface IniSettingMetaDiagnostic {
  code:
    | "duplicate_identity"
    | "unsupported_owner"
    | "unsupported_absence_policy"
    | "unsupported_enforcement"
    | "unsupported_confidence"
    | "stale_verified_provenance"
    | "invalid_reviewed_at"
    | "seed_missing_from_catalog"
    | "owned_catalog_missing_from_seed";
  message: string;
  id?: string;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && !Number.isNaN(Date.parse(value));
}

function seedEntries(): Array<{ id: string; owner: string }> {
  const out: Array<{ id: string; owner: string }> = [];
  for (const [id, value] of Object.entries(ownershipSeed)) {
    if (id.startsWith("$")) continue;
    if (value && typeof value === "object" && "owner" in value) {
      out.push({ id, owner: String((value as { owner: string }).owner) });
    }
  }
  return out;
}

/** Consistency checks for the generated catalog and ownership seed. */
export function diagnoseIniSettingMetaCatalog(): IniSettingMetaDiagnostic[] {
  const diagnostics: IniSettingMetaDiagnostic[] = [];
  const seen = new Set<string>();

  for (const setting of iniSettingMetaList) {
    const identity = `${setting.file}\0${setting.section}\0${setting.key}`.toLowerCase();
    if (seen.has(identity)) {
      diagnostics.push({
        code: "duplicate_identity",
        id: setting.id,
        message: `Duplicate catalog identity for ${setting.id}`,
      });
    }
    seen.add(identity);

    if (!OWNERS.has(setting.owner)) {
      diagnostics.push({
        code: "unsupported_owner",
        id: setting.id,
        message: `Unsupported owner "${setting.owner}" on ${setting.id}`,
      });
    }
    if (!ABSENCE_POLICIES.has(setting.absencePolicy)) {
      diagnostics.push({
        code: "unsupported_absence_policy",
        id: setting.id,
        message: `Unsupported absencePolicy "${setting.absencePolicy}" on ${setting.id}`,
      });
    }
    if (!ENFORCEMENTS.has(setting.enforcement)) {
      diagnostics.push({
        code: "unsupported_enforcement",
        id: setting.id,
        message: `Unsupported enforcement "${setting.enforcement}" on ${setting.id}`,
      });
    }
    if (!CONFIDENCES.has(setting.provenance.confidence)) {
      diagnostics.push({
        code: "unsupported_confidence",
        id: setting.id,
        message: `Unsupported provenance.confidence "${setting.provenance.confidence}" on ${setting.id}`,
      });
    }
    if (setting.provenance.confidence === "verified" && !setting.provenance.reviewedAt) {
      diagnostics.push({
        code: "stale_verified_provenance",
        id: setting.id,
        message: `verified provenance missing reviewedAt on ${setting.id}`,
      });
    }
    if (setting.provenance.reviewedAt != null && !isIsoDate(setting.provenance.reviewedAt)) {
      diagnostics.push({
        code: "invalid_reviewed_at",
        id: setting.id,
        message: `Invalid reviewedAt "${setting.provenance.reviewedAt}" on ${setting.id}`,
      });
    }
  }

  const catalogIds = new Set(iniSettingMetaList.map((s) => s.id));
  const seed = seedEntries();
  const seedIds = new Set(seed.map((e) => e.id));
  for (const entry of seed) {
    if (!catalogIds.has(entry.id)) {
      diagnostics.push({
        code: "seed_missing_from_catalog",
        id: entry.id,
        message: `Ownership seed id missing from catalog: ${entry.id}`,
      });
    }
  }

  for (const setting of iniSettingMetaList) {
    if (setting.owner === "serverProfile" || setting.owner === "system") {
      if (!seedIds.has(setting.id)) {
        diagnostics.push({
          code: "owned_catalog_missing_from_seed",
          id: setting.id,
          message: `Owned catalog entry missing from ownership seed: ${setting.id}`,
        });
      }
    }
  }

  return diagnostics;
}
