import { describe, expect, it } from "vitest";
import { KNOWN_MAPS } from "@shared/types";
import { resolveMapArtUrl } from "@ui/MapArtThumb/mapArt";

describe("resolveMapArtUrl", () => {
  it("resolves artwork for every KNOWN_MAPS id", () => {
    for (const mapId of KNOWN_MAPS) {
      const url = resolveMapArtUrl(mapId);
      expect(url, `missing art for ${mapId}`).not.toBeNull();
      expect(url).toMatch(new RegExp(mapId));
    }
  });

  it("returns null for unknown or blank map ids", () => {
    expect(resolveMapArtUrl("CustomModMap_WP")).toBeNull();
    expect(resolveMapArtUrl("")).toBeNull();
    expect(resolveMapArtUrl("  ")).toBeNull();
  });
});
