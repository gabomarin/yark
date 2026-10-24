import { supplyCrateRowKey } from "./supply-crate-entries";

interface CrateIdentity {
  section: string;
  occurrence: number;
  className: string;
}

/** The open crate after the file is reloaded. A new line is matched by its class. */
export function keepSupplyCrateSelection(
  selected: string | null,
  pending: readonly { id: string; body: { className: string } }[],
  drafts: Readonly<Record<string, { className: string } | undefined>>,
  rows: readonly CrateIdentity[],
): string | null {
  if (selected === null) return null;
  if (rows.some((row) => supplyCrateRowKey(row) === selected)) return selected;
  const className = pending.find((item) => item.id === selected)?.body.className ?? drafts[selected]?.className;
  if (className === undefined) return null;
  const needle = className.trim().toLowerCase();
  const matches = rows.filter((row) => row.className.trim().toLowerCase() === needle);
  const fresh = matches.filter((row) => drafts[supplyCrateRowKey(row)] === undefined);
  const match = fresh[fresh.length - 1] ?? matches[matches.length - 1];
  return match === undefined ? null : supplyCrateRowKey(match);
}
