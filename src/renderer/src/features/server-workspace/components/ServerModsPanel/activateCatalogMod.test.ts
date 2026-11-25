import { describe, expect, it, vi } from "vitest";
import type { ModMetadata } from "@shared/types";
import { activateCatalogMod } from "./activateCatalogMod";

const sampleMod: ModMetadata = {
  id: "929420",
  name: "Super Spyglass Plus",
  summary: "",
  thumbnailUrl: null,
  authors: ["kavan87"],
  downloadCount: 1,
  dateModified: "2026-05-28T00:00:00.000Z",
  curseforgeUrl: "https://www.curseforge.com/ark-survival-ascended/mods/super-spyglass-plus",
  slug: "super-spyglass-plus",
  categories: ["General"],
};

describe("activateCatalogMod (#639)", () => {
  it("does not add or clear busy when the operator switched servers mid-fetch", async () => {
    let activeServerId = "server-a";
    let resolveFetch: (value: { ok: true; data: ModMetadata }) => void = () => undefined;
    const api = {
      getModByReference: vi.fn(
        () =>
          new Promise<{ ok: true; data: ModMetadata }>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    };
    (window as unknown as { api: typeof api }).api = api;

    const add = vi.fn(async () => undefined);
    const setBusyKey = vi.fn();
    const setError = vi.fn();
    const pending = activateCatalogMod({
      mod: sampleMod,
      serverId: "server-a",
      getActiveServerId: () => activeServerId,
      setBusyKey,
      setError,
      setWarning: vi.fn(),
      add,
    });

    expect(setBusyKey).toHaveBeenCalledWith("super-spyglass-plus");
    activeServerId = "server-b";
    resolveFetch({ ok: true, data: sampleMod });
    await pending;

    expect(add).not.toHaveBeenCalled();
    expect(setBusyKey).not.toHaveBeenCalledWith(null);
    // Initial clear only — no error toast for the abandoned server.
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(null);
  });
});
