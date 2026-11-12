import { describe, expect, it } from "vitest";
import type { ModMetadata } from "@shared/types";
import {
  buildDiscoveryRows,
  buildServerRows,
  EMPTY_SERVER_MODS_INVENTORY_FILTER,
  filterServerModRows,
  formatModIdsCsv,
  isServerModsInventoryFilterActive,
  mergeMetadata,
  modsMetadataSyncKey,
  pickModListCategory,
  reorderModIds,
  selectModIdsForCopy,
  sortModRows,
  type ModRow,
} from "./serverModsModel";

function row(partial: Partial<ModRow> & Pick<ModRow, "key" | "name" | "loadIndex">): ModRow {
  return {
    id: partial.id ?? partial.key,
    slug: partial.slug ?? partial.key,
    author: partial.author ?? "Author",
    summary: partial.summary ?? "",
    thumbnailUrl: null,
    categories: [],
    downloads: partial.downloads ?? "0",
    downloadCount: partial.downloadCount ?? 0,
    updated: partial.updated ?? "Unknown",
    updatedAt: partial.updatedAt ?? 0,
    url: null,
    configured: true,
    enabled: true,
    ...partial,
    passive: partial.passive ?? false,
  };
}

const baseMeta: ModMetadata = {
  id: "1",
  name: "Mod",
  summary: "Summary",
  thumbnailUrl: null,
  authors: ["A"],
  downloadCount: 10,
  dateModified: "2026-01-01T00:00:00.000Z",
  curseforgeUrl: "https://example.com/m",
  slug: "mod",
  categories: ["General"],
};

describe("serverModsModel sort/reorder", () => {
  it("sorts by name without changing loadIndex values", () => {
    const rows = [
      row({ key: "a", name: "Zeta", loadIndex: 0, downloadCount: 1 }),
      row({ key: "b", name: "Alpha", loadIndex: 1, downloadCount: 9 }),
    ];
    const sorted = sortModRows(rows, {
      columnAccessor: "name",
      direction: "asc",
    });
    expect(sorted.map((item) => item.name)).toEqual(["Alpha", "Zeta"]);
    expect(sorted.map((item) => item.loadIndex)).toEqual([1, 0]);
  });

  it("reorders mod ids for load-order persistence", () => {
    expect(reorderModIds(["1", "2", "3"], 0, 2)).toEqual(["2", "3", "1"]);
    expect(reorderModIds(["1", "2", "3"], 2, 0)).toEqual(["3", "1", "2"]);
    expect(reorderModIds(["1", "2", "3"], 1, 1)).toEqual(["1", "2", "3"]);
  });
});

describe("serverModsModel passive state", () => {
  it("does not mark disabled configured rows passive", () => {
    const rows = buildServerRows(["1"], new Set(["1"]), new Map([["1", baseMeta]]), new Set(["1"]));
    expect(rows[0]?.passive).toBe(false);
  });

  it("keeps a configured passive mark visible in Discover", () => {
    const rows = buildDiscoveryRows(
      ["1"],
      new Set(),
      new Map([["1", baseMeta]]),
      { items: [baseMeta], pagination: { index: 0, pageSize: 20, resultCount: 1, totalCount: 1 } },
      new Set(["1"]),
    );
    expect(rows[0]?.passive).toBe(true);
  });
});

describe("serverModsModel metadata sync", () => {
  it("changes sync key when downloadCount changes with same name/date", () => {
    const previous = modsMetadataSyncKey({ "1": baseMeta });
    const next = modsMetadataSyncKey({
      "1": { ...baseMeta, downloadCount: 99 },
    });
    expect(next).not.toBe(previous);
  });

  it("merges when thumbnail changes without date/name change", () => {
    const previous = new Map([["1", baseMeta]]);
    const next = mergeMetadata(previous, {
      "1": { ...baseMeta, thumbnailUrl: "https://cdn.example/t.png" },
    });
    expect(next).not.toBe(previous);
    expect(next.get("1")?.thumbnailUrl).toBe("https://cdn.example/t.png");
  });

  it("merges when screenshots appear without other field changes (#342)", () => {
    const previous = new Map([["1", baseMeta]]);
    const next = mergeMetadata(previous, {
      "1": {
        ...baseMeta,
        screenshots: ["https://cdn.example/a.jpg"],
      },
    });
    expect(next).not.toBe(previous);
    expect(next.get("1")?.screenshots).toEqual(["https://cdn.example/a.jpg"]);
  });
});

describe("selectModIdsForCopy / filterServerModRows (#634, #636)", () => {
  it("copies all, enabled (-mods=), and disabled ID lists in load order", () => {
    const configured = ["10", "20", "30"];
    const disabled = new Set(["20"]);
    expect(selectModIdsForCopy(configured, disabled, "all")).toEqual(["10", "20", "30"]);
    expect(selectModIdsForCopy(configured, disabled, "enabled")).toEqual(["10", "30"]);
    expect(selectModIdsForCopy(configured, disabled, "disabled")).toEqual(["20"]);
    expect(formatModIdsCsv(["10", "30"])).toBe("10,30");
  });

  it("filters inventory by name, Project ID, and Status options", () => {
    const rows = [
      row({ key: "1", id: "101", name: "Spyglass", loadIndex: 0, enabled: true, passive: false }),
      row({ key: "2", id: "202", name: "Custom Map", loadIndex: 1, enabled: false, passive: false }),
      row({ key: "3", id: "303", name: "Structures", loadIndex: 2, enabled: true, passive: true }),
    ];
    expect(filterServerModRows(rows, EMPTY_SERVER_MODS_INVENTORY_FILTER)).toHaveLength(3);
    expect(filterServerModRows(rows, { query: "spy", statuses: [] }).map((r) => r.id)).toEqual(["101"]);
    expect(filterServerModRows(rows, { query: "202", statuses: [] }).map((r) => r.id)).toEqual(["202"]);
    expect(filterServerModRows(rows, { query: "", statuses: ["disabled"] }).map((r) => r.id)).toEqual(["202"]);
    expect(filterServerModRows(rows, { query: "", statuses: ["passive"] }).map((r) => r.id)).toEqual(["303"]);
    expect(filterServerModRows(rows, { query: "", statuses: ["enabled"] }).map((r) => r.id)).toEqual(["101", "303"]);
    expect(isServerModsInventoryFilterActive({ query: "x", statuses: [] })).toBe(true);
    expect(isServerModsInventoryFilterActive(EMPTY_SERVER_MODS_INVENTORY_FILTER)).toBe(false);
  });
});

describe("pickModListCategory", () => {
  it("prefers Maps and reports extra tags as +N", () => {
    expect(pickModListCategory([])).toEqual({
      label: null,
      extraCount: 0,
      extraLabels: [],
      isMap: false,
    });
    expect(pickModListCategory(["Visuals and Sounds"])).toEqual({
      label: "Visuals and Sounds",
      extraCount: 0,
      extraLabels: [],
      isMap: false,
    });
    expect(pickModListCategory(["General", "Maps", "Creatures"])).toEqual({
      label: "Maps",
      extraCount: 2,
      extraLabels: ["General", "Creatures"],
      isMap: true,
    });
    expect(pickModListCategory(["Maps", "Maps"])).toEqual({
      label: "Maps",
      extraCount: 1,
      extraLabels: ["Maps"],
      isMap: true,
    });
  });
});
