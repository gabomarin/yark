import { describe, expect, it, vi } from "vitest";
import { createServerModsListMutations } from "./serverModsListMutations";
import { MODS_REORDER_BUSY_KEY } from "./serverModsBusy";

describe("createServerModsListMutations reorder", () => {
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
      configuredIds: ["a", "b"],
      disabledIds: [],
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
