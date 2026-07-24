import { describe, expect, it } from "vitest";
import { MOCK_MOD_CATALOG } from "../../src/backend/domains/mods/mock-mod-catalog";
import {
  ModsService,
  normalizeModId,
} from "../../src/backend/domains/mods/mods-service";

describe("ModsService (mock catalog)", () => {
  const service = new ModsService();

  it("normalizes numeric CurseForge project IDs", () => {
    expect(normalizeModId(" 928793 ")).toBe("928793");
    expect(() => normalizeModId("abc")).toThrow(/Invalid mod ID/);
  });

  it("returns hardcoded metadata for known mods", async () => {
    const meta = await service.getMod("928793");
    expect(meta.name).toBe(MOCK_MOD_CATALOG["928793"]!.name);
    expect(meta.authors).toContain("Pelayori");
  });

  it("returns a placeholder for unknown IDs without failing", async () => {
    const meta = await service.getMod("111111");
    expect(meta.id).toBe("111111");
    expect(meta.name).toBe("Mod 111111");
  });

  it("hydrates many mods preserving request order of unique ids", async () => {
    const list = await service.getMods(["929420", "928793", "929420"]);
    expect(list.map((item) => item.id)).toEqual(["929420", "928793"]);
    expect(list[0]?.name).toBe(MOCK_MOD_CATALOG["929420"]!.name);
  });
});
