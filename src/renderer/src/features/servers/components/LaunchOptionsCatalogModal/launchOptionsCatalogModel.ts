import type {
  AsaLaunchOptionEntry,
  AsaLaunchOptionStatus,
} from "@shared/asa-launch-options-catalog";

/** Filters shown in the browse modal (`unsupported` rows omitted). */
export type CatalogStatusFilter =
  | "all"
  | "supported"
  | "uncertain"
  | "yarkOwned";

export const CATALOG_STATUS_FILTERS: readonly CatalogStatusFilter[] = [
  "all",
  "supported",
  "uncertain",
  "yarkOwned",
] as const;

export function catalogStatusLabel(status: CatalogStatusFilter | "unsupported"): string {
  switch (status) {
    case "all":
      return "All";
    case "supported":
      return "Supported";
    case "unsupported":
      return "Unsupported";
    case "uncertain":
      return "Uncertain";
    case "yarkOwned":
      return "YARK-owned";
  }
}

export function catalogStatusToneClass(
  status: Exclude<AsaLaunchOptionStatus, "unsupported">,
): string {
  switch (status) {
    case "supported":
      return "toneOk";
    case "uncertain":
      return "toneWarn";
    case "yarkOwned":
      return "toneCryo";
  }
}

export function catalogStatusFilterTooltip(filter: CatalogStatusFilter): string {
  switch (filter) {
    case "all":
      return "ASA options you can browse here. Rows marked unsupported stay hidden.";
    case "supported":
      return "These work on ASA. You can turn them on from the Launch tab.";
    case "uncertain":
      return "The wiki is not sure these work on ASA. They stay here for reference, not on the Launch tab.";
    case "yarkOwned":
      return "YARK already fills these in from Server settings, Mods, or cluster. Do not add them again in Extra arguments.";
  }
}

/** Operator-facing surface that already owns a YARK-composed launch token. */
export type YarkManagedSurface =
  | "Server settings"
  | "Mods"
  | "GameUserSettings (GUS) INI"
  | "Game INI"
  | "Launch";

export const YARK_OWNED_CATALOG_IDS = [
  "map-session",
  "port",
  "winlivemaxplayers-integer",
  "mods",
  "clusterid",
  "cluster-dir",
  "no-transfer-from-filtering",
] as const;

type YarkOwnedCatalogId = (typeof YARK_OWNED_CATALOG_IDS)[number];

const YARK_MANAGED_SURFACE_BY_ID: Record<YarkOwnedCatalogId, YarkManagedSurface> = {
  "map-session": "Server settings",
  port: "Server settings",
  "winlivemaxplayers-integer": "Server settings",
  mods: "Mods",
  clusterid: "Server settings",
  "cluster-dir": "Server settings",
  "no-transfer-from-filtering": "Server settings",
};

function isYarkOwnedCatalogId(id: string): id is YarkOwnedCatalogId {
  return (YARK_OWNED_CATALOG_IDS as readonly string[]).includes(id);
}

export function yarkManagedSurfaceForCatalogId(id: string): YarkManagedSurface {
  if (!isYarkOwnedCatalogId(id)) {
    throw new Error(
      `YARK-owned catalog id "${id}" has no managed-surface mapping; add it to YARK_MANAGED_SURFACE_BY_ID.`,
    );
  }
  return YARK_MANAGED_SURFACE_BY_ID[id];
}

export function yarkManagedLaunchCopy(id: string): string {
  return `YARK already sets this from ${yarkManagedSurfaceForCatalogId(id)}. Do not add it in Extra arguments.`;
}

export type CatalogBrowseSecondary =
  | { kind: "managed"; text: string }
  | { kind: "conflicts"; items: readonly string[] };

/** List/detail secondary line: hide extraArgs audit tokens on YARK-owned rows. */
export function catalogBrowseSecondary(
  entry: Pick<AsaLaunchOptionEntry, "id" | "status" | "conflicts">,
): CatalogBrowseSecondary | null {
  if (entry.status === "yarkOwned") {
    return { kind: "managed", text: yarkManagedLaunchCopy(entry.id) };
  }
  if (entry.conflicts.length > 0) {
    return { kind: "conflicts", items: entry.conflicts };
  }
  return null;
}

/** Internal YARK-owned notes stay out of the browse UI; Managed copy covers them. */
export function shouldShowCatalogNotes(
  entry: Pick<AsaLaunchOptionEntry, "status" | "notes">,
): boolean {
  if (entry.status === "yarkOwned") return false;
  return Boolean(entry.notes?.trim());
}

/** Hide boilerplate “stays off / built-in default” rows in the browse UI. */
export function isInformativeDefaultSemantics(text: string): boolean {
  const value = text.trim().toLowerCase();
  if (!value) return false;
  if (value === "if omitted, this option stays off.") return false;
  if (value === "if omitted, asa keeps its built-in default.") return false;
  return true;
}
