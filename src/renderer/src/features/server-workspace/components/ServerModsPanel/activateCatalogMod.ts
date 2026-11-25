import type { ModMetadata } from "@shared/types";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";

/**
 * Resolve a Discover catalog item through `mods:get-by-reference`, then persist
 * (new IDs start disabled).
 */
export async function activateCatalogMod(input: {
  mod: ModMetadata;
  setBusyKey: (key: string | null) => void;
  setError: (message: string | null) => void;
  setWarning: (message: string | null) => void;
  add: (mod: ModMetadata) => Promise<void>;
}): Promise<void> {
  input.setBusyKey(input.mod.slug);
  input.setError(null);
  input.setWarning(null);
  await runWithFinally(
    async () => {
      try {
        const result = await window.api.getModByReference(input.mod.id || input.mod.slug);
        if (!result.ok) throw new Error(result.error);
        await input.add(result.data);
      } catch (cause) {
        input.setError(cause instanceof Error ? cause.message : "Could not add the mod");
      }
    },
    () => {
      input.setBusyKey(null);
    },
  );
}
