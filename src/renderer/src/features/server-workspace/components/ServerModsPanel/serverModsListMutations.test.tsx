import { describe, expect, it, vi } from "vitest";
import { createServerModsListMutations } from "./serverModsListMutations";
import { MODS_REORDER_BUSY_KEY } from "./serverModsBusy";

describe("createServerModsListMutations", () => {
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
});
