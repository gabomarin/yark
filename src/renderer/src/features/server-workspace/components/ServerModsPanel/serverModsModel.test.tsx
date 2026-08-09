import { describe, expect, it } from "vitest";
import {
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
    category: null,
    downloads: partial.downloads ?? "0 downloads",
    downloadCount: partial.downloadCount ?? 0,
    updated: partial.updated ?? "Unknown",
    updatedAt: partial.updatedAt ?? 0,
    url: null,
    configured: true,
    enabled: true,
    ...partial,
  };
}

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
