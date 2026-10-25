import catalogJson from "./asa-engram-catalog.json";

/** Official ASA engram class for the Game.ini picker (PINI-012 / #684). */
export interface AsaEngramEntry {
  className: string;
  label: string;
  /** Game default required level. Not written until the operator sets it. */
  level: number;
  /** Game default engram point cost. Not written until the operator sets it. */
  points: number;
  /** Wiki section. Filter only. Not an INI field. */
  pack: string;
}

interface AsaEngramCatalog {
  version: string;
  generatedAt: string;
  source: {
    url: string;
    fetchedAt: string;
    note: string;
  };
  count: number;
  entries: AsaEngramEntry[];
}

const catalog = catalogJson as AsaEngramCatalog;

export const asaEngramCatalog: AsaEngramCatalog = catalog;

export const asaEngramEntries: readonly AsaEngramEntry[] = catalog.entries;

const byClass = new Map(asaEngramEntries.map((entry) => [entry.className.toLowerCase(), entry] as const));

export function lookupAsaEngram(className: string): AsaEngramEntry | undefined {
  return byClass.get(className.trim().toLowerCase());
}
