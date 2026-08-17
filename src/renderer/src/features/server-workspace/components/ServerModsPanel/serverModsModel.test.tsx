import { describe, expect, it } from "vitest";
import type { ModMetadata } from "@shared/types";
import {
  mergeMetadata,
  modsMetadataSyncKey,
  pickModListCategory,
  reorderModIds,
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
