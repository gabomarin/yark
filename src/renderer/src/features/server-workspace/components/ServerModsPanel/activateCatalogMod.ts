import type { ModMetadata } from "@shared/types";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";

/**
 * Resolve a Discover catalog item through `mods:get-by-reference`, then persist
 * (new IDs start disabled). Ignores the result if the operator switched servers
 * while the lookup was in flight (#639).
 */
export async function activateCatalogMod(input: {
  mod: ModMetadata;
  /** Server id when Add was clicked. */
  serverId: string;
  /** Latest workspace server id (ref read). */
  getActiveServerId: () => string;
  setBusyKey: (key: string | null) => void;
  setError: (message: string | null) => void;
  setWarning: (message: string | null) => void;
  add: (mod: ModMetadata) => Promise<void>;
}): Promise<void> {
  const targetServerId = input.serverId;
  const stillOnTarget = () => input.getActiveServerId() === targetServerId;

  input.setBusyKey(input.mod.slug);
  input.setError(null);
  input.setWarning(null);
  await runWithFinally(
    async () => {
      try {
        const result = await window.api.getModByReference(input.mod.id || input.mod.slug);
        if (!stillOnTarget()) return;
        if (!result.ok) throw new Error(result.error);
        await input.add(result.data);
      } catch (cause) {
        if (!stillOnTarget()) return;
        input.setError(cause instanceof Error ? cause.message : "Could not add the mod");
      }
    },
    () => {
      if (stillOnTarget()) input.setBusyKey(null);
    },
  );
}
