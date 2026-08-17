import { describe, expect, it } from "vitest";
import {
  isModRowBusy,
  isModsListBusy,
  MODS_REORDER_BUSY_KEY,
} from "./serverModsTableColumns";
import type { ModRow } from "./serverModsModel";

const row: ModRow = {
  key: "id:947033",
  id: "947033",
  slug: "awesomespyglass",
  name: "Awesome Spyglass!",
  author: "ChrisMods",
  summary: "",
  thumbnailUrl: null,
  categories: [],
  downloads: "0",
  downloadCount: 0,
  updated: "Unknown",
  updatedAt: null,
  url: null,
  configured: true,
  enabled: true,
  loadIndex: 0,
};

describe("isModRowBusy", () => {
  it("treats reorder persist as busy for every row", () => {
    expect(isModsListBusy(MODS_REORDER_BUSY_KEY)).toBe(true);
    expect(isModRowBusy(MODS_REORDER_BUSY_KEY, row)).toBe(true);
    expect(isModRowBusy(null, row)).toBe(false);
    expect(isModRowBusy("947033", row)).toBe(true);
    expect(isModRowBusy("other", row)).toBe(false);
  });
});
