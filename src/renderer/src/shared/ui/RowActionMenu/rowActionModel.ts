import type { ReactNode } from "react";
import type { MantineColor } from "@mantine/core";

/** Shared row/card action used by kebab `Menu` and right-click context menus. */
export type RowActionEntry =
  | { kind: "label"; key: string; label: string }
  | { kind: "divider"; key: string }
  | {
      kind: "item";
      key: string;
      label: string;
      icon?: ReactNode;
      color?: MantineColor;
      disabled?: boolean;
      hidden?: boolean;
      /** Native title / tooltip when the item is disabled. */
      title?: string;
      onClick: () => void;
    };

export function visibleRowActionItems(
  entries: readonly RowActionEntry[],
): Extract<RowActionEntry, { kind: "item" }>[] {
  return entries.filter(
    (entry): entry is Extract<RowActionEntry, { kind: "item" }> =>
      entry.kind === "item" && entry.hidden !== true,
  );
}

/** Stable signature for enablement / labels (ignores handler and icon identity). */
export function rowActionFingerprint(entries: readonly RowActionEntry[]): string {
  return normalizeRowActionEntries(entries)
    .map((entry) => {
      if (entry.kind === "label") return `label:${entry.key}:${entry.label}`;
      if (entry.kind === "divider") return `divider:${entry.key}`;
      return [
        "item",
        entry.key,
        entry.label,
        entry.color ?? "",
        entry.disabled === true ? "1" : "0",
        entry.title ?? "",
      ].join(":");
    })
    .join("|");
}

/** Drop stacked / leading / trailing dividers after hidden items are omitted. */
export function normalizeRowActionEntries(
  entries: readonly RowActionEntry[],
): RowActionEntry[] {
  const out: RowActionEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "item" && entry.hidden === true) continue;
    if (entry.kind === "divider") {
      if (out.length === 0) continue;
      const prev = out[out.length - 1];
      if (prev?.kind === "divider" || prev?.kind === "label") continue;
      out.push(entry);
      continue;
    }
    if (entry.kind === "label") {
      // Avoid back-to-back labels with nothing between after filtering.
      const prev = out[out.length - 1];
      if (prev?.kind === "label") {
        out[out.length - 1] = entry;
        continue;
      }
      out.push(entry);
      continue;
    }
    out.push(entry);
  }
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last?.kind === "divider" || last?.kind === "label") {
      out.pop();
      continue;
    }
    break;
  }
  return out;
}
