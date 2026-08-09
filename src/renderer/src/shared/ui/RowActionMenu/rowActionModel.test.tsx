import { describe, expect, it, vi } from "vitest";
import {
  normalizeRowActionEntries,
  rowActionFingerprint,
  visibleRowActionItems,
  type RowActionEntry,
} from "./rowActionModel";

describe("rowActionModel", () => {
  const sample: RowActionEntry[] = [
    { kind: "label", key: "lbl", label: "Actions" },
    {
      kind: "item",
      key: "open",
      label: "Open",
      onClick: vi.fn(),
    },
    { kind: "divider", key: "d1" },
    { kind: "divider", key: "d2" },
    {
      kind: "item",
      key: "hidden",
      label: "Hidden",
      hidden: true,
      onClick: vi.fn(),
    },
    {
      kind: "item",
      key: "delete",
      label: "Delete",
      color: "red",
      onClick: vi.fn(),
    },
    { kind: "divider", key: "trailing" },
  ];

  it("lists only visible items", () => {
    expect(visibleRowActionItems(sample).map((item) => item.key)).toEqual([
      "open",
      "delete",
    ]);
  });

  it("normalizes stacked and trailing dividers after hidden items", () => {
    const items = normalizeRowActionEntries(sample);
    expect(items.map((item) => item.key)).toEqual([
      "lbl",
      "open",
      "d1",
      "delete",
    ]);
  });

  it("fingerprints enablement without depending on handler identity", () => {
    const a = rowActionFingerprint(sample);
    const b = rowActionFingerprint(
      sample.map((entry) =>
        entry.kind === "item"
          ? { ...entry, onClick: vi.fn() }
          : entry,
      ),
    );
    expect(a).toBe(b);
  });
});
