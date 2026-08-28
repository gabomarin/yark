import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ModMetadata } from "@shared/types";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { sameModMetadata, type ModRow } from "./serverModsModel";

interface InspectInput {
  row: ModRow;
  cacheRef: MutableRefObject<Record<string, ModMetadata>>;
  configuredIdsRef: MutableRefObject<string[]>;
  disabledIdsRef: MutableRefObject<string[]>;
  inspectTargetRef: MutableRefObject<string | null>;
  setDetail: Dispatch<SetStateAction<ModMetadata | null>>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setWarning: Dispatch<SetStateAction<string | null>>;
  persist: (
    nextIds: string[],
    nextDisabled: string[],
    nextCache: Record<string, ModMetadata>,
  ) => Promise<void>;
}

/**
 * Open drawer from cache when present, then always refresh via get-by-id so
 * screenshots + long description land for Server mods / Discover (#342).
 * Ignores stale responses after close or a newer inspect target.
 */
export async function inspectServerMod(input: InspectInput): Promise<void> {
  const { row } = input;
  const cachedDetail = row.id === null ? undefined : input.cacheRef.current[row.id];
  if (cachedDetail !== undefined) {
    input.setDetail(cachedDetail);
  }
  const ref = row.id ?? row.slug;
  if (ref.length === 0) return;
  input.inspectTargetRef.current = ref;
  input.setBusyKey(`detail:${row.slug}`);
  input.setError(null);
  input.setWarning(null);
  await runWithFinally(
    async () => {
      try {
        const result = await window.api.getModByReference(ref);
        if (input.inspectTargetRef.current !== ref) return;
        if (!result.ok) throw new Error(result.error);
        input.setDetail(result.data);
        if (input.configuredIdsRef.current.includes(result.data.id)) {
          const previous = input.cacheRef.current[result.data.id];
          if (
            previous === undefined
            || !sameModMetadata(previous, result.data)
          ) {
            await input.persist(
              input.configuredIdsRef.current,
              input.disabledIdsRef.current,
              {
                ...input.cacheRef.current,
                [result.data.id]: result.data,
              },
            );
          }
        }
      } catch (cause) {
        if (input.inspectTargetRef.current !== ref) return;
        if (cachedDetail === undefined) {
          input.setError(
            cause instanceof Error ? cause.message : "Could not load mod metadata",
          );
        }
      }
    },
    () => {
      if (input.inspectTargetRef.current === ref) {
        input.setBusyKey(null);
      }
    },
  );
}
