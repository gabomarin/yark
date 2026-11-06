import {
  canKeepConflictSide,
  payloadWithKeptChoices,
  sameConflictOccurrence,
  semanticOpForKeptSide,
  type ConflictKeepSide,
  type IniConflictOccurrence,
} from "@shared/ini/ini-conflict";
import type { ServerIniPayload, ServerIniSnapshot } from "@shared/types";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { sanitizeServerIniPayload } from "../../iniModel";
import { adoptIniSaveSnapshot } from "./configurationEditorSave";

export interface ConflictChoice {
  conflict: IniConflictOccurrence;
  side: ConflictKeepSide;
}

/** Keep every reviewed choice in one write. The notice stays until this finishes. */
export async function applyEditorConflictChoices(input: {
  serverId: string;
  choices: readonly ConflictChoice[];
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setStaleDocument: (stale: boolean) => void;
  setConflicts: (update: (prev: IniConflictOccurrence[]) => IniConflictOccurrence[]) => void;
  setPayload: (payload: ServerIniPayload | null) => void;
  setBaseline: (payload: ServerIniPayload | null) => void;
  setSnapshot: (update: (prev: ServerIniSnapshot | null) => ServerIniSnapshot | null) => void;
  payloadRef: { readonly current: ServerIniPayload | null };
  baselineRef: { readonly current: ServerIniPayload | null };
  conflictsRef: { current: readonly IniConflictOccurrence[] };
  publishDirty: (payload: ServerIniPayload | null, baseline: ServerIniPayload | null) => void;
  clearExternalChange: () => void;
  onBeforeConflictBaseline?: (choices: readonly ConflictChoice[]) => void;
}): Promise<void> {
  const kept = input.choices.filter((choice) => canKeepConflictSide(choice.conflict, choice.side));
  if (kept.length === 0) return;
  const ops = kept.flatMap((choice) => {
    const op = semanticOpForKeptSide(choice.conflict, choice.side);
    return op === null ? [] : [op];
  });
  const adopt = (): void => {
    input.onBeforeConflictBaseline?.(kept);
    const nextPayload =
      input.payloadRef.current === null ? null : payloadWithKeptChoices(input.payloadRef.current, kept);
    const nextBaseline =
      input.baselineRef.current === null ? null : payloadWithKeptChoices(input.baselineRef.current, kept);
    input.setPayload(nextPayload);
    input.setBaseline(nextBaseline);
    input.publishDirty(nextPayload, nextBaseline);
    const rest = input.conflictsRef.current.filter(
      (row) => !kept.some((choice) => sameConflictOccurrence(row, choice.conflict)),
    );
    input.conflictsRef.current = rest;
    input.setConflicts(() => rest);
    if (rest.length === 0) {
      input.setError(null);
      input.setStaleDocument(false);
      input.clearExternalChange();
    }
  };
  if (ops.length === 0) {
    adopt();
    return;
  }
  input.setBusy(true);
  await runWithFinally(
    async () => {
      try {
        const result = await window.api.saveServerIniSemantic(input.serverId, ops);
        if (!result.ok) {
          input.setError(result.error ?? "Could not save the INI");
          input.setStaleDocument(true);
          const next = result.conflicts ?? [];
          const rest = [
            ...input.conflictsRef.current.filter(
              (row) => !kept.some((choice) => sameConflictOccurrence(row, choice.conflict)),
            ),
            ...next,
          ];
          input.conflictsRef.current = rest;
          input.setConflicts(() => rest);
          return;
        }
        input.setSnapshot((prev) =>
          adoptIniSaveSnapshot(prev, {
            payload: sanitizeServerIniPayload(result.data.payload),
            fingerprints: result.data.fingerprints,
            pending: result.data.pending,
          }),
        );
        adopt();
      } catch (err: unknown) {
        input.setError(err instanceof Error && err.message.trim().length > 0 ? err.message : "Could not save the INI");
        input.setStaleDocument(true);
      }
    },
    () => {
      input.setBusy(false);
    },
  );
}

/** Hold a line editor only when every choice for it keeps the open draft. A disk choice must rebuild that editor. */
export function conflictLineResyncPlan(choices: readonly ConflictChoice[]): {
  holdEngram: boolean;
  holdLoot: boolean;
  resetEngrams: boolean;
  resetLoot: boolean;
} {
  let yarkEngram = false;
  let yarkLoot = false;
  let otherEngram = false;
  let otherLoot = false;
  for (const choice of choices) {
    const kind = choice.conflict.kind;
    if (choice.conflict.fileKey !== "game" || kind === "scalar") continue;
    const loot = kind === "crate";
    if (choice.side === "yark") {
      if (loot) yarkLoot = true;
      else yarkEngram = true;
    } else if (loot) otherLoot = true;
    else otherEngram = true;
  }
  return {
    holdEngram: yarkEngram && !otherEngram,
    holdLoot: yarkLoot && !otherLoot,
    resetEngrams: otherEngram,
    resetLoot: otherLoot,
  };
}
