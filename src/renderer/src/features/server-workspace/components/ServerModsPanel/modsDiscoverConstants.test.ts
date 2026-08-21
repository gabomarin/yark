import { describe, expect, it } from "vitest";
import {
  discoverColumnSort,
  discoverSortFromColumn,
  isDiscoverDefaultSort,
} from "./modsDiscoverConstants";

describe("modsDiscoverConstants catalog sort", () => {
  it("detects the Popularity default", () => {
    expect(isDiscoverDefaultSort(2, "desc")).toBe(true);
    expect(isDiscoverDefaultSort(2, "asc")).toBe(false);
    expect(isDiscoverDefaultSort(6, "desc")).toBe(false);
  });

  it("round-trips column accessors with CurseForge sort fields", () => {
    expect(discoverSortFromColumn("downloadCount", "asc")).toEqual({
      sortField: 6,
      sortOrder: "asc",
    });
    expect(discoverColumnSort(3, "desc")).toEqual({
      columnAccessor: "updatedAt",
      direction: "desc",
    });
    expect(discoverColumnSort(2, "desc")).toBeNull();
    expect(discoverSortFromColumn("loadIndex", "asc")).toBeNull();
  });
});
