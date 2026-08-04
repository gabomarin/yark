import { describe, expect, it } from "vitest";
import { resolveMapArtUrl } from "@ui/MapArtThumb/mapArt";

describe("resolveMapArtUrl", () => {
  it("resolves known ASA maps", () => {
    expect(resolveMapArtUrl("TheIsland_WP")).toMatch(/TheIsland_WP/);
    expect(resolveMapArtUrl("Aberration_WP")).toMatch(/Aberration_WP/);
    expect(resolveMapArtUrl("Valguero_WP")).toMatch(/Valguero_WP/);
    expect(resolveMapArtUrl("Astraeos_WP")).toMatch(/Astraeos_WP/);
  });

  it("returns null for unknown or blank map ids", () => {
    expect(resolveMapArtUrl("CustomModMap_WP")).toBeNull();
    expect(resolveMapArtUrl("")).toBeNull();
    expect(resolveMapArtUrl("  ")).toBeNull();
  });
});
