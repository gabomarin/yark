import { describe, expect, it } from "vitest";
import type { ModMetadata } from "@shared/types";
import {
  buildServerRows,
  mergeMissingMetadata,
} from "../../src/renderer/src/features/server-workspace/components/ServerModsPanel/serverModsModel";

const scraped: ModMetadata = {
  id: "929420",
  name: "Super Spyglass Plus",
  summary: "Scraped detail",
  thumbnailUrl: "https://83374.media.forgecdn.net/avatars/scraped.png",
  authors: ["kavan87"],
  downloadCount: 100,
  dateModified: "2026-05-28T00:00:00.000Z",
  curseforgeUrl:
    "https://www.curseforge.com/ark-survival-ascended/mods/super-spyglass-plus",
  slug: "super-spyglass-plus",
  categories: ["General"],
};

describe("mergeMissingMetadata", () => {
  it("does not let fallback metadata overwrite scraped cache data", () => {
    const fallback: ModMetadata = {
      ...scraped,
      name: "Mod 929420",
      thumbnailUrl: null,
      categories: [],
    };
    const result = mergeMissingMetadata(
      new Map([[scraped.id, scraped]]),
      [fallback],
    );
    expect(result.get(scraped.id)).toEqual(scraped);
  });
});

describe("buildServerRows", () => {
  it("omits CurseForge URL when metadata is missing", () => {
    const rows = buildServerRows(["111"], new Set(), new Map());
    expect(rows[0]?.url).toBeNull();
  });
});
