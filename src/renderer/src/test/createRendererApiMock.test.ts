import { describe, expect, it, vi } from "vitest";
import type { RendererApi } from "@shared/ipc";
import {
  createRendererApiMock,
  TEST_OFFICIAL_VERSION,
} from "./createRendererApiMock";

describe("createRendererApiMock", () => {
  it("returns a function for every own key (complete RendererApi surface)", () => {
    const api = createRendererApiMock();
    const keys = Object.keys(api) as (keyof RendererApi)[];
    expect(keys.length).toBeGreaterThan(80);
    for (const key of keys) {
      expect(typeof api[key], String(key)).toBe("function");
    }
  });

  it("applies overrides after defaults (spread order)", async () => {
    const listServers = vi.fn().mockResolvedValue({
      ok: true,
      data: [{ id: "override" }],
    });
    const api = createRendererApiMock({ listServers });

    expect(api.listServers).toBe(listServers);
    await expect(api.listServers()).resolves.toEqual({
      ok: true,
      data: [{ id: "override" }],
    });
  });

  it("keeps mount-safe defaults for App overview paths", async () => {
    const api = createRendererApiMock();
    await expect(api.getInstallationInfo()).resolves.toMatchObject({
      ok: true,
      data: { officialVersion: TEST_OFFICIAL_VERSION, servers: [] },
    });
    await expect(api.listServers()).resolves.toEqual({ ok: true, data: [] });
  });
});
