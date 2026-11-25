import { describe, expect, it } from "vitest";
import type { ModMetadata } from "@shared/types";
import {
  buildDiscoveryRows,
  buildServerRows,
  EMPTY_SERVER_MODS_INVENTORY_FILTER,
  filterServerModRows,
  formatModIdsCsv,
  isServerModsInventoryFilterActive,
  isUnresolvedProjectStub,
  mergeConfirmedMetadataFetch,
  mergeMetadata,
  modsMetadataSyncKey,
  pickModListCategory,
  canMoveModIdInLoadOrder,
  moveModIdInLoadOrder,
  reorderModIds,
  selectModIdsForCopy,
  shouldApplyDetailRefresh,
  sortModRows,
  unresolvedProjectMetadata,
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
    noPage: partial.noPage ?? false,
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

  it("moves a Project ID in load order without drag (#638)", () => {
    expect(moveModIdInLoadOrder(["1", "2", "3"], "2", "up")).toEqual(["2", "1", "3"]);
    expect(moveModIdInLoadOrder(["1", "2", "3"], "2", "down")).toEqual(["1", "3", "2"]);
    expect(moveModIdInLoadOrder(["1", "2", "3"], "3", "top")).toEqual(["3", "1", "2"]);
    expect(moveModIdInLoadOrder(["1", "2", "3"], "1", "bottom")).toEqual(["2", "3", "1"]);
    expect(canMoveModIdInLoadOrder(["1", "2", "3"], "1", "up")).toBe(false);
    expect(canMoveModIdInLoadOrder(["1", "2", "3"], "3", "down")).toBe(false);
    expect(canMoveModIdInLoadOrder(["1", "2", "3"], "2", "top")).toBe(true);
  });
});

describe("serverModsModel missing metadata (#698)", () => {
  it("keeps pending rows without a No page badge when metadata is still missing", () => {
    const rows = buildServerRows(["932759"], new Set(["932759"]), new Map());
    expect(rows[0]).toMatchObject({
      name: "Project 932759",
      author: "Unknown author",
      noPage: false,
      downloads: "Unknown",
      enabled: false,
    });
  });

  it("shows Project ID / No page copy for confirmed unresolved stubs", () => {
    const rows = buildServerRows(
      ["932759"],
      new Set(["932759"]),
      new Map([["932759", unresolvedProjectMetadata("932759")]]),
    );
    expect(rows[0]).toMatchObject({
      name: "Project 932759",
      author: "No CurseForge page yet",
      noPage: true,
      downloads: "Unknown",
      enabled: false,
    });
    expect(isUnresolvedProjectStub(unresolvedProjectMetadata("932759"))).toBe(true);
  });

  it("seeds No page stubs only for IDs omitted from a successful fetch", () => {
    const next = mergeConfirmedMetadataFetch(new Map(), ["1", "2"], [baseMeta]);
    expect(next.get("1")).toEqual(baseMeta);
    expect(next.get("2")).toEqual(unresolvedProjectMetadata("2"));
  });

  it("ignores Check CurseForge again responses after the drawer closes", () => {
    expect(shouldApplyDetailRefresh(null, "932759", { id: "932759", slug: "mod" })).toBe(false);
    expect(shouldApplyDetailRefresh("932759", "932759", { id: "932759", slug: "mod" })).toBe(true);
    expect(shouldApplyDetailRefresh("mod", "932759", { id: "932759", slug: "mod" })).toBe(true);
    expect(shouldApplyDetailRefresh("other", "932759", { id: "932759", slug: "mod" })).toBe(false);
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
    expect(selectModIdsForCopy(configured, disabled, "selected", new Set(["30", "10"]))).toEqual(["10", "30"]);
    expect(selectModIdsForCopy(configured, disabled, "selected", new Set())).toEqual([]);
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
