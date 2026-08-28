import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ModMetadata } from "@shared/types";
import { fetchMapsSearchDetail } from "../../src/renderer/src/features/servers/components/ServerForm/mapsSearchInspect";

const sampleMod: ModMetadata = {
  id: "962796",
  name: "Svartalfheim Premium",
  summary: "Map pack",
  description: "Map Name: Svartalfheim_WP",
  thumbnailUrl: null,
  authors: ["Team"],
  downloadCount: 1000,
  dateModified: "2026-01-01T00:00:00.000Z",
  curseforgeUrl: "https://www.curseforge.com/ark-survival-ascended/mods/svart",
  slug: "svart",
  categories: ["Maps"],
};

describe("fetchMapsSearchDetail", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      api: {
        getModByReference: vi.fn(async () => ({
          ok: true,
          data: { ...sampleMod, description: "Full description from CurseForge" },
        })),
      },
    });
  });

  it("shows cached mod then refreshes via get-by-id", async () => {
    const inspectTargetRef = { current: null as string | null };
    const details: ModMetadata[] = [];
    const loading: boolean[] = [];

    await fetchMapsSearchDetail({
      mod: sampleMod,
      inspectTargetRef,
      onDetail: (detail) => details.push(detail),
      onLoading: (value) => loading.push(value),
      onError: () => {},
    });

    expect(details[0]).toEqual(sampleMod);
    expect(details.at(-1)?.description).toBe("Full description from CurseForge");
    expect(loading).toEqual([true, false]);
    expect(window.api.getModByReference).toHaveBeenCalledWith("962796");
  });
});
