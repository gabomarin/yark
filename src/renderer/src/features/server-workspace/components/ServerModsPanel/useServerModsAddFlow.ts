import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ModMetadata } from "@shared/types";
import { prepareModAddApply, type ModAddImportProgress } from "@shared/mods/mod-add-input";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { notifyNewlyAddedMods } from "./notifyModsAddedDisabled";
import { mergeMissingMetadata, shouldApplyDetailRefresh, unresolvedProjectMetadata } from "./serverModsModel";
import { stageUnverifiedProjectIds } from "./unverifiedModAdd";

interface Input {
  url: string;
  setUrl: Dispatch<SetStateAction<string>>;
  configuredIds: string[];
  configuredIdsRef: MutableRefObject<string[]>;
  disabledIdsRef: MutableRefObject<string[]>;
  passiveIdsRef: MutableRefObject<string[]>;
  cacheRef: MutableRefObject<Record<string, ModMetadata>>;
  inspectTargetRef: MutableRefObject<string | null>;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setWarning: Dispatch<SetStateAction<string | null>>;
  setDetail: Dispatch<SetStateAction<ModMetadata | null>>;
  setMetadata: Dispatch<SetStateAction<Map<string, ModMetadata>>>;
  persist: (
    nextIds: string[],
    nextDisabled: string[],
    nextCache: Record<string, ModMetadata>,
    nextPassive?: string[],
    options?: { allowUnverifiedModIds?: string[] },
  ) => Promise<void>;
}

/**
 * Add-by-ID/URL flow plus operator-confirmed unverified Project IDs (#698) and
 * Check CurseForge again for No page rows.
 */
export function useServerModsAddFlow(input: Input) {
  const [unverifiedProjectIds, setUnverifiedProjectIds] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState<ModAddImportProgress | null>(null);
  const refreshGenerationRef = useRef(0);

  const addFromInput = async () => {
    input.setBusyKey("url");
    input.setError(null);
    input.setWarning(null);
    setUnverifiedProjectIds([]);
    setImportProgress(null);
    await runWithFinally(
      async () => {
        try {
          const outcome = await prepareModAddApply(
            input.url,
            {
              configuredIds: input.configuredIds,
              disabledIds: input.disabledIdsRef.current,
              cache: input.cacheRef.current,
            },
            (ref) => window.api.getModByReference(ref),
            {
              onProgress: setImportProgress,
              onBatchComplete: async (next) => {
                await input.persist(next.configuredIds, next.disabledIds, next.cache);
              },
            },
          );
          if (outcome.status === "validation-error") {
            input.setError(outcome.message);
            return;
          }
          if (outcome.clearInput) {
            input.setUrl("");
          }
          if (outcome.warning !== null) input.setWarning(outcome.warning);
          if (outcome.error !== null) input.setError(outcome.error);
          setUnverifiedProjectIds(outcome.unverifiedProjectIds);
          if (outcome.status === "ready") {
            notifyNewlyAddedMods(input.configuredIds, outcome.next);
          }
        } catch (cause) {
          input.setError(cause instanceof Error ? cause.message : "Could not add the mod");
        }
      },
      () => {
        input.setBusyKey(null);
        setImportProgress(null);
      },
    );
  };

  const addUnverifiedProjectIds = async () => {
    if (unverifiedProjectIds.length === 0) return;
    const ids = [...unverifiedProjectIds];
    input.setBusyKey("url");
    input.setError(null);
    input.setWarning(null);
    await runWithFinally(
      async () => {
        try {
          const previousIds = input.configuredIdsRef.current;
          const next = stageUnverifiedProjectIds(
            {
              configuredIds: input.configuredIdsRef.current,
              disabledIds: input.disabledIdsRef.current,
              cache: input.cacheRef.current,
            },
            ids,
          );
          await input.persist(next.configuredIds, next.disabledIds, next.cache, input.passiveIdsRef.current, {
            allowUnverifiedModIds: ids,
          });
          // Seed No page stubs in memory only — profile cache stays empty (#698).
          input.setMetadata((previous) =>
            mergeMissingMetadata(previous, ids.filter((id) => !previous.has(id)).map(unresolvedProjectMetadata)),
          );
          setUnverifiedProjectIds([]);
          input.setUrl("");
          notifyNewlyAddedMods(previousIds, next);
        } catch (cause) {
          input.setError(cause instanceof Error ? cause.message : "Could not add the Project ID");
        }
      },
      () => {
        input.setBusyKey(null);
      },
    );
  };

  const refreshDetailMetadata = async (modId: string) => {
    const generation = ++refreshGenerationRef.current;
    input.setBusyKey(`detail:${modId}`);
    input.setError(null);
    input.setWarning(null);
    await runWithFinally(
      async () => {
        try {
          const result = await window.api.getModByReference(modId);
          if (generation !== refreshGenerationRef.current) return;
          if (!result.ok) throw new Error(result.error);
          if (!shouldApplyDetailRefresh(input.inspectTargetRef.current, modId, result.data)) {
            return;
          }
          input.setDetail(result.data);
          if (input.configuredIdsRef.current.includes(result.data.id)) {
            await input.persist(input.configuredIdsRef.current, input.disabledIdsRef.current, {
              ...input.cacheRef.current,
              [result.data.id]: result.data,
            });
          }
        } catch (cause) {
          if (generation !== refreshGenerationRef.current) return;
          if (input.inspectTargetRef.current === null) return;
          input.setWarning(cause instanceof Error ? cause.message : "Could not refresh CurseForge metadata");
        }
      },
      () => {
        if (generation === refreshGenerationRef.current) {
          input.setBusyKey(null);
        }
      },
    );
  };

  return {
    unverifiedProjectIds,
    setUnverifiedProjectIds,
    importProgress,
    addFromInput,
    addUnverifiedProjectIds,
    refreshDetailMetadata,
  };
}
