import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_MOD_CATALOG } from "@backend/domains/mods/mock-mod-catalog";
import {
  ModsService,
  normalizeModId,
} from "@backend/domains/mods/mods-service";
import {
  METADATA_SERVICE_NOT_CONFIGURED_MESSAGE,
  normalizeCurseforgeProxyUrl,
} from "@shared/curseforge-proxy-url";
import type { ModMetadata, ServerProfileInput } from "@shared/types";

const awesome: ModMetadata = {
  id: "947033",
  name: "Awesome Spyglass",
  summary: "Improved spyglass",
  thumbnailUrl: null,
  authors: ["ChrisMods"],
  downloadCount: 1,
  dateModified: "2026-03-15T12:00:00.000Z",
  curseforgeUrl:
    "https://www.curseforge.com/ark-survival-ascended/mods/awesomespyglass",
  slug: "awesomespyglass",
  categories: ["Visuals"],
};

function profileInput(mods: string[]): ServerProfileInput {
  return {
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\ARK\\Island",
    sessionName: "Island",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods,
    autoStart: false,
  };
}

afterEach(() => {
  delete process.env.YARK_CURSEFORGE_PROXY_URL;
});

describe("normalizeCurseforgeProxyUrl", () => {
  it("normalizes https URLs and strips trailing slashes", () => {
    expect(normalizeCurseforgeProxyUrl("https://proxy.example/")).toBe(
      "https://proxy.example",
    );
  });

  it("allows loopback http only", () => {
    expect(normalizeCurseforgeProxyUrl("http://127.0.0.1:8787")).toBe(
      "http://127.0.0.1:8787",
    );
    expect(() => normalizeCurseforgeProxyUrl("http://example.com")).toThrow(/loopback/);
  });

  it("rejects credentials and query strings", () => {
    expect(() =>
      normalizeCurseforgeProxyUrl("https://user:pass@proxy.example"),
    ).toThrow(/credentials/);
    expect(() => normalizeCurseforgeProxyUrl("https://proxy.example?x=1")).toThrow(
      /query/,
    );
  });
});

describe("ModsService (mock catalog)", () => {
  const service = new ModsService({ useMockCatalog: true });

  it("normalizes numeric CurseForge project IDs", () => {
    expect(normalizeModId(" 928793 ")).toBe("928793");
    expect(() => normalizeModId("abc")).toThrow(/Invalid mod ID/);
    expect(() => normalizeModId("0123")).toThrow(/leading zeros/);
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

  it("has no official Worker URL as a source fallback", () => {
    expect(new ModsService({ buildDefaultUrl: "" }).getBaseUrl()).toBeNull();
  });

  it("searches the mock catalog", async () => {
    const page = await service.search("spyglass");
    expect(page.items.some((item) => item.slug.includes("spyglass"))).toBe(true);
  });

  it("resolves a known catalog slug", async () => {
    const meta = await service.getByReference("cryopods");
    expect(meta.id).toBe("928793");
  });
});

describe("ModsService proxy URL precedence (#151)", () => {
  it("prefers env over build", () => {
    process.env.YARK_CURSEFORGE_PROXY_URL = "https://env.example/";
    const service = new ModsService({
      buildDefaultUrl: "https://build.example",
    });
    expect(service.getBaseUrl()).toBe("https://env.example");
  });

  it("uses build default when env is empty", () => {
    const service = new ModsService({
      buildDefaultUrl: "https://build.example/",
    });
    expect(service.getBaseUrl()).toBe("https://build.example");
  });

  it("fails closed when no endpoint is configured", async () => {
    const service = new ModsService({ buildDefaultUrl: "" });
    await expect(service.getMod("947033")).rejects.toThrow(
      METADATA_SERVICE_NOT_CONFIGURED_MESSAGE,
    );
  });

  it("rejects a malformed env URL instead of falling through to build", () => {
    process.env.YARK_CURSEFORGE_PROXY_URL = "http://example.com";
    const service = new ModsService({
      buildDefaultUrl: "https://build.example",
    });
    expect(() => service.getBaseUrl()).toThrow(/loopback/);
  });
});

describe("ModsService (Worker client)", () => {
  it("maps a successful Worker envelope", async () => {
    const fetchImpl = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: awesome,
        }),
      }) as Response,
    );
    const service = new ModsService({
      buildDefaultUrl: "",
      baseUrl: "https://proxy.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const meta = await service.getMod("947033");
    expect(meta.slug).toBe("awesomespyglass");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://proxy.test/v1/mods/947033",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
  });

  it("surfaces Worker error messages", async () => {
    const service = new ModsService({
      buildDefaultUrl: "",
      baseUrl: "https://proxy.test",
      fetchImpl: (async () =>
        ({
          ok: false,
          status: 404,
          json: async () => ({
            ok: false,
            error: { code: "not_asa_mod", message: "Not an ASA mod" },
          }),
        }) as Response) as typeof fetch,
    });
    await expect(service.getMod("1")).rejects.toThrow("Not an ASA mod");
  });

  it("returns resolved batch items even when some IDs are skipped", async () => {
    const fetchImpl = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            items: [awesome],
            skipped: [{ id: "1", reason: "not_asa_mod" }],
          },
        }),
      }) as Response,
    );
    const service = new ModsService({
      buildDefaultUrl: "",
      baseUrl: "https://proxy.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const list = await service.getMods(["947033", "1"]);
    expect(list.map((item) => item.id)).toEqual(["947033"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://proxy.test/v1/mods",
      expect.objectContaining({
        body: JSON.stringify({ modIds: ["947033", "1"] }),
      }),
    );
  });

  it("keys batch results by stringified Worker ids", async () => {
    const fetchImpl = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            items: [{ ...awesome, id: 947033 as unknown as string }],
            skipped: [],
          },
        }),
      }) as Response,
    );
    const service = new ModsService({
      buildDefaultUrl: "",
      baseUrl: "https://proxy.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const list = await service.getMods(["947033"]);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("947033");
  });
});

describe("ModsService.enrichNewServerMods", () => {
  it("Worker-verifies new IDs and ignores untrusted client cache", async () => {
    const fetchImpl = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            items: [awesome],
            skipped: [],
          },
        }),
      }) as Response,
    );
    const service = new ModsService({
      buildDefaultUrl: "",
      baseUrl: "https://proxy.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const forged: ModMetadata = {
      ...awesome,
      name: "Forged",
      curseforgeUrl:
        "https://www.curseforge.com/ark-survival-ascended/mods/awesomespyglass",
    };
    const result = await service.enrichNewServerMods(
      {
        ...profileInput(["947033"]),
        modMetadataCache: { "947033": forged },
      },
      { mods: [] },
    );
    expect(fetchImpl).toHaveBeenCalled();
    expect(result.modMetadataCache?.["947033"]?.name).toBe("Awesome Spyglass");
  });

  it("rejects a new ID the Worker cannot resolve", async () => {
    const service = new ModsService({
      buildDefaultUrl: "",
      baseUrl: "https://proxy.test",
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: { items: [], skipped: [{ id: "1", reason: "not_found" }] },
          }),
        }) as Response) as typeof fetch,
    });
    await expect(
      service.enrichNewServerMods(profileInput(["1"]), { mods: [] }),
    ).rejects.toThrow(/metadata could not be resolved/);
  });

  it("preserves IDs already stored on the profile without re-fetch", async () => {
    const fetchImpl = vi.fn();
    const service = new ModsService({
      buildDefaultUrl: "",
      baseUrl: "https://proxy.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await service.enrichNewServerMods(profileInput(["947033"]), {
      mods: ["947033"],
      modMetadataCache: { "947033": awesome },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.mods).toEqual(["947033"]);
    expect(result.modMetadataCache?.["947033"]).toEqual(awesome);
  });
});
