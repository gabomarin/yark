import type { ModMetadata } from "@shared/types";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";

/** Fetch full CurseForge metadata (description, screenshots) for Maps search inspect (#295). */
export async function fetchMapsSearchDetail(input: {
  mod: ModMetadata;
  inspectTargetRef: { current: string | null };
  onDetail: (detail: ModMetadata) => void;
  onLoading: (loading: boolean) => void;
  onError: (message: string | null) => void;
}): Promise<void> {
  const ref = input.mod.id;
  input.inspectTargetRef.current = ref;
  input.onDetail(input.mod);
  input.onError(null);
  input.onLoading(true);
  await runWithFinally(
    async () => {
      const result = await window.api.getModByReference(ref);
      if (input.inspectTargetRef.current !== ref) return;
      if (!result.ok) {
        input.onError(result.error);
        return;
      }
      input.onDetail(result.data);
    },
    () => {
      if (input.inspectTargetRef.current === ref) {
        input.onLoading(false);
      }
    },
  );
}
