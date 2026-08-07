import catalogJson from "./asa-launch-options-catalog.json";

/** Support classification for ASA CLI catalog entries (#92). */
export type AsaLaunchOptionStatus =
  | "supported"
  | "unsupported"
  | "uncertain"
  | "yarkOwned";

export type AsaLaunchOptionValueType =
  | "flag"
  | "string"
  | "number"
  | "enum"
  | "csv";

export interface AsaLaunchOptionSource {
  label: string;
  url: string;
}

export interface AsaLaunchOptionEntry {
  id: string;
  token: string;
  aliases: string[];
  valueType: AsaLaunchOptionValueType;
  category: string;
  /** Short operator-facing line (first sentence / clipped). */
  summary: string;
  /** Remaining cleaned wiki detail; empty when the summary is enough. */
  details: string;
  /** Full cleaned description (summary + details) for search / audit. */
  description: string;
  /** Concrete CLI example an operator can paste. */
  example: string;
  defaultSemantics: string;
  status: AsaLaunchOptionStatus;
  conflicts: string[];
  wikiAsa: string;
  wikiAse: string;
  wikiDeprecated: boolean;
  wikiSincePatch: string | null;
  sources: AsaLaunchOptionSource[];
  reviewedAt: string;
  notes?: string;
}

export interface AsaLaunchOptionsCatalog {
  version: string;
  generatedAt: string;
  source: {
    url: string;
    page: string;
    section: string;
    note: string;
  };
  ownershipRules: {
    yarkOwnedExcludedFromSelectable: boolean;
    uncertainNotSelectable: boolean;
    unsupportedNotSelectable: boolean;
    composerOrder: string[];
  };
  counts: Record<AsaLaunchOptionStatus, number>;
  entries: AsaLaunchOptionEntry[];
}

const catalog = catalogJson as AsaLaunchOptionsCatalog;

export const asaLaunchOptionsCatalog: AsaLaunchOptionsCatalog = catalog;

export const asaLaunchOptionEntries: readonly AsaLaunchOptionEntry[] =
  catalog.entries;

const byId = new Map(
  asaLaunchOptionEntries.map((entry) => [entry.id, entry] as const),
);

/** Entries eligible for future structured UI (#93). */
export function isSelectableLaunchOption(entry: AsaLaunchOptionEntry): boolean {
  return entry.status === "supported";
}

export function listSelectableLaunchOptions(): AsaLaunchOptionEntry[] {
  return asaLaunchOptionEntries.filter(isSelectableLaunchOption);
}

export function lookupLaunchOptionById(
  id: string,
): AsaLaunchOptionEntry | undefined {
  return byId.get(id);
}

export function filterLaunchOptions(args: {
  status?: AsaLaunchOptionStatus | "all";
  query?: string;
  /** When true (default for browse UI), omit ASE-only / unsupported rows. */
  asaOnly?: boolean;
}): AsaLaunchOptionEntry[] {
  const status = args.status ?? "all";
  const asaOnly = args.asaOnly !== false;
  const q = (args.query ?? "").trim().toLowerCase();
  return asaLaunchOptionEntries.filter((entry) => {
    if (asaOnly && entry.status === "unsupported") return false;
    if (status !== "all" && entry.status !== status) return false;
    if (!q) return true;
    return (
      entry.token.toLowerCase().includes(q) ||
      entry.summary.toLowerCase().includes(q) ||
      entry.details.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.example.toLowerCase().includes(q) ||
      entry.category.toLowerCase().includes(q) ||
      entry.aliases.some((alias) => alias.toLowerCase().includes(q)) ||
      entry.id.toLowerCase().includes(q)
    );
  });
}

/** Counts for the ASA browse modal (excludes unsupported / ASE-only). */
export function countAsaBrowseLaunchOptions(): Record<
  "all" | "supported" | "uncertain" | "yarkOwned",
  number
> {
  const counts = { all: 0, supported: 0, uncertain: 0, yarkOwned: 0 };
  for (const entry of asaLaunchOptionEntries) {
    if (entry.status === "unsupported") continue;
    counts.all += 1;
    if (entry.status === "supported") counts.supported += 1;
    if (entry.status === "uncertain") counts.uncertain += 1;
    if (entry.status === "yarkOwned") counts.yarkOwned += 1;
  }
  return counts;
}
