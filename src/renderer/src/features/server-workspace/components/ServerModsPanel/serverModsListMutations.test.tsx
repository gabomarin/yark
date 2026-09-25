import { notifications } from "@mantine/notifications";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModMetadata } from "@shared/types";
import { createServerModsListMutations } from "./serverModsListMutations";
import { MODS_BULK_BUSY_KEY, MODS_REORDER_BUSY_KEY } from "./serverModsBusy";
import { resetModAddedToastQueue } from "./notifyModsAddedDisabled";

const sampleMod = {
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
      setDisabledIds: vi.fn(),
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    disabledIdsRef.current = ["a", "b"];
    await toggle("a", true);
    expect(persist).toHaveBeenCalledWith(["a", "b"], ["b"], {}, []);
  });

  it("marks a passive id optimistically and persists the set", async () => {
    const persist = vi.fn(async () => undefined);
    const passiveIdsRef = { current: [] as string[] };
    const setPassiveIds = vi.fn();
    const { setPassive } = createServerModsListMutations({
      configuredIdsRef: { current: ["a", "b"] },
      disabledIdsRef: { current: [] },
      passiveIdsRef,
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey: vi.fn(),
      setDisabledIds: vi.fn(),
      setPassiveIds,
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    await setPassive("b", true);
    expect(setPassiveIds).toHaveBeenCalledWith(["b"]);
    expect(passiveIdsRef.current).toEqual(["b"]);
    expect(persist).toHaveBeenCalledWith(["a", "b"], [], {}, ["b"]);
  });

  it("refuses to mark a disabled mod passive", async () => {
    const persist = vi.fn(async () => undefined);
    const { setPassive } = createServerModsListMutations({
      configuredIdsRef: { current: ["a", "b"] },
      disabledIdsRef: { current: ["b"] },
      passiveIdsRef: { current: [] },
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey: vi.fn(),
      setDisabledIds: vi.fn(),
      setPassiveIds: vi.fn(),
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    await setPassive("b", true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("sets the reorder busy key while persisting load order", async () => {
    const setBusyKey = vi.fn();
    const setDisabledIds = vi.fn();
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
      setDisabledIds,
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
    const setBusyKey = vi.fn();
    const setDisabledIds = vi.fn();
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    const { add } = createServerModsListMutations({
      configuredIdsRef: { current: ["947033"] },
      disabledIdsRef: { current: [] },
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey,
      setDisabledIds,
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    await add(sampleMod);
    expect(setBusyKey).toHaveBeenCalledWith("929420");
    expect(setBusyKey).toHaveBeenLastCalledWith(null);
    expect(persist).toHaveBeenCalledWith(["947033", "929420"], ["929420"], { "929420": sampleMod });
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Mod Added",
        message: expect.stringContaining("will not load until you enable it"),
        color: "attention",
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
      setDisabledIds: vi.fn(),
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    await add(sampleMod);
    expect(persist).toHaveBeenCalledWith(["929420"], [], { "929420": sampleMod });
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("sets busy and error when add persist fails", async () => {
    const persist = vi.fn(async () => {
      throw new Error("Could not save");
    });
    const setBusyKey = vi.fn();
    const setDisabledIds = vi.fn();
    const setError = vi.fn();
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    const { add } = createServerModsListMutations({
      configuredIdsRef: { current: [] },
      disabledIdsRef: { current: [] },
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey,
      setDisabledIds,
      setError,
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    await add(sampleMod);
    expect(setBusyKey).toHaveBeenCalledWith("929420");
    expect(setBusyKey).toHaveBeenLastCalledWith(null);
    expect(setError).toHaveBeenCalledWith("Could not save");
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("restores the previous disabled ids when a toggle persist fails", async () => {
    const persist = vi.fn(async () => {
      throw new Error("Could not save");
    });
    const disabledIdsRef = { current: ["a"] };
    const setDisabledIds = vi.fn();
    const setError = vi.fn();
    const { toggle } = createServerModsListMutations({
      configuredIdsRef: { current: ["a", "b"] },
      disabledIdsRef,
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey: vi.fn(),
      setDisabledIds,
      setError,
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    });

    await toggle("a", true);

    // Optimistic paint first, then the failed write puts both the ref and the state back.
    expect(setDisabledIds).toHaveBeenNthCalledWith(1, []);
    expect(setDisabledIds).toHaveBeenLastCalledWith(["a"]);
    expect(disabledIdsRef.current).toEqual(["a"]);
    expect(setError).toHaveBeenCalledWith("Could not save");
  });

  it("keeps a write that landed when only the follow-up notification throws", async () => {
    const persist = vi.fn(async () => undefined);
    const notifyMapModIfNeeded = vi.fn(async () => {
      throw new Error("notify failed");
    });
    const disabledIdsRef = { current: ["a"] };
    const setDisabledIds = vi.fn();
    const setError = vi.fn();
    const { toggle } = createServerModsListMutations({
      configuredIdsRef: { current: ["a", "b"] },
      disabledIdsRef,
      metadata: new Map(),
      cacheRef: { current: {} },
      setBusyKey: vi.fn(),
      setDisabledIds,
      setError,
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded,
    });

    await toggle("a", true);

    // The profile has the new value, so undoing the UI here would be a lie.
    expect(setDisabledIds).toHaveBeenLastCalledWith([]);
    expect(disabledIdsRef.current).toEqual([]);
    expect(setError).toHaveBeenCalledWith("notify failed");
  });

  function bulkInput(
    overrides: {
      configured?: string[];
      disabled?: string[];
      cache?: Record<string, ModMetadata>;
      persist?: (ids: string[], disabled: string[], cache: Record<string, ModMetadata>) => Promise<void>;
    } = {},
  ) {
    const setBusyKey = vi.fn();
    const persist = overrides.persist ?? vi.fn(async () => undefined);
    const input = {
      configuredIdsRef: { current: overrides.configured ?? ["a", "b"] },
      disabledIdsRef: { current: overrides.disabled ?? [] },
      metadata: new Map<string, ModMetadata>(),
      cacheRef: { current: overrides.cache ?? {} },
      setBusyKey,
      setDisabledIds: vi.fn(),
      setError: vi.fn(),
      setWarning: vi.fn(),
      persist,
      notifyMapModIfNeeded: vi.fn(),
    };
    return { ...createServerModsListMutations(input), setBusyKey, persist };
  }

  it("enables every mod in one patch when enabling all (#637)", async () => {
    const persist = vi.fn(async () => undefined);
    const { enableAll, setBusyKey } = bulkInput({ configured: ["a", "b"], disabled: ["a", "b"], persist });

    await enableAll();

    expect(setBusyKey).toHaveBeenCalledWith(MODS_BULK_BUSY_KEY);
    expect(persist).toHaveBeenCalledWith(["a", "b"], [], {});
    expect(setBusyKey).toHaveBeenLastCalledWith(null);
  });

  it("disables every configured mod in one patch when disabling all (#637)", async () => {
    const persist = vi.fn(async () => undefined);
    const { disableAll } = bulkInput({ configured: ["a", "b"], disabled: [], persist });

    await disableAll();

    expect(persist).toHaveBeenCalledWith(["a", "b"], ["a", "b"], {}, []);
  });

  it("removes disabled mods and their cache in one patch (#637)", async () => {
    const persist = vi.fn(async () => undefined);
    const { removeAllDisabled } = bulkInput({
      configured: ["a", "b", "c"],
      disabled: ["b"],
      cache: { b: { id: "b" } as ModMetadata, a: { id: "a" } as ModMetadata },
      persist,
    });

    await removeAllDisabled();

    expect(persist).toHaveBeenCalledWith(["a", "c"], [], { a: { id: "a" } }, []);
  });

  it("shows one aggregated map toast when bulk-enabling map mods (#637)", async () => {
    const persist = vi.fn(async () => undefined);
    const notifySpy = vi.spyOn(notifications, "show").mockImplementation(() => "id");
    const { enableAll } = bulkInput({
      configured: ["a", "b"],
      disabled: ["a", "b"],
      cache: {
        a: { id: "a", name: "Map One", categories: ["Maps"] } as ModMetadata,
        b: { id: "b", name: "Map Two", categories: ["Maps"] } as ModMetadata,
      },
      persist,
    });

    await enableAll();

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({ title: "2 map mods available" }));
  });

  it("skips the write when the bulk action would change nothing (#637)", async () => {
    const persist = vi.fn(async () => undefined);
    const emptyDisabled = bulkInput({ configured: ["a"], disabled: [], persist });
    await emptyDisabled.enableAll();
    await emptyDisabled.removeAllDisabled();
    const allDisabled = bulkInput({ configured: ["a"], disabled: ["a"], persist });
    await allDisabled.disableAll();

    expect(persist).not.toHaveBeenCalled();
  });
});
