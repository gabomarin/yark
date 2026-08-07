import type { AsaLaunchOptionStatus } from "@shared/asa-launch-options-catalog";

/** Filters shown in the browse modal (ASE-only / unsupported omitted). */
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

/** Hide boilerplate “stays off / built-in default” rows in the browse UI. */
export function isInformativeDefaultSemantics(text: string): boolean {
  const value = text.trim().toLowerCase();
  if (!value) return false;
  if (value === "if omitted, this option stays off.") return false;
  if (value === "if omitted, asa keeps its built-in default.") return false;
  return true;
}
