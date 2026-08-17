import { notifications } from "@mantine/notifications";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerModsListMutations } from "./serverModsListMutations";
import { MODS_REORDER_BUSY_KEY } from "./serverModsBusy";
import { resetModAddedToastQueue } from "./notifyModsAddedDisabled";

const sampleMod = {
  id: "929420",
  name: "Super Spyglass Plus",
  summary: "",
  thumbnailUrl: null,
  authors: ["kavan87"],
  downloadCount: 1,
  dateModified: "2026-05-28T00:00:00.000Z",
  curseforgeUrl:
    "https://www.curseforge.com/ark-survival-ascended/mods/super-spyglass-plus",
  slug: "super-spyglass-plus",
  categories: ["General"],
};

describe("createServerModsListMutations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetModAddedToastQueue();
  });
  it("reads the latest disabled ids from the ref on toggle", async () => {
    const persist = vi.fn(async () => undefined);
    const disabledIdsRef = { current: ["a"] };
    const { toggle } = createServerModsListMutations({
      configuredIdsRef: { current: ["a", "b"] },
      disabledIdsRef,
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey: vi.fn(),
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    disabledIdsRef.current = ["a", "b"];
    await toggle("a", true);
    expect(persist).toHaveBeenCalledWith(["a", "b"], ["b"], {});
  });

  it("sets the reorder busy key while persisting load order", async () => {
    const setBusyKey = vi.fn();
    let resolvePersist: (() => void) | undefined;
    const persist = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePersist = resolve;
        }),
    );

    const { reorder } = createServerModsListMutations({
      configuredIdsRef: { current: ["a", "b"] },
      disabledIdsRef: { current: [] },
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey,
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    const pending = reorder(["b", "a"]);
    expect(setBusyKey).toHaveBeenCalledWith(MODS_REORDER_BUSY_KEY);
    expect(persist).toHaveBeenCalledWith(["b", "a"], [], {});

    resolvePersist?.();
    await pending;
    expect(setBusyKey).toHaveBeenLastCalledWith(null);
  });

  it("starts new mods disabled and toasts that they are not live yet (#226)", async () => {
    const persist = vi.fn(async () => undefined);
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    const { add } = createServerModsListMutations({
      configuredIdsRef: { current: ["947033"] },
      disabledIdsRef: { current: [] },
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey: vi.fn(),
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    await add(sampleMod);
    expect(persist).toHaveBeenCalledWith(
      ["947033", "929420"],
      ["929420"],
      { "929420": sampleMod },
    );
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Mod Added",
        message: expect.stringContaining("will not load until you enable it"),
        color: "yellow",
      }),
    );
  });

  it("does not toast when re-adding an already configured mod", async () => {
    const persist = vi.fn(async () => undefined);
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    const { add } = createServerModsListMutations({
      configuredIdsRef: { current: ["929420"] },
      disabledIdsRef: { current: [] },
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey: vi.fn(),
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    await add(sampleMod);
    expect(persist).toHaveBeenCalledWith(["929420"], [], { "929420": sampleMod });
    expect(notifySpy).not.toHaveBeenCalled();
  });
});
