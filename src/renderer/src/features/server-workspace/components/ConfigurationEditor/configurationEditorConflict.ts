import {
  canKeepConflictSide,
  payloadWithKeptValue,
  sameConflictOccurrence,
  semanticOpForKeptSide,
  type ConflictKeepSide,
  type IniConflictOccurrence,
} from "@shared/ini/ini-conflict";
import type { ServerIniPayload } from "@shared/types";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";

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
  payloadRef: { readonly current: ServerIniPayload | null };
  baselineRef: { readonly current: ServerIniPayload | null };
  publishDirty: (payload: ServerIniPayload | null, baseline: ServerIniPayload | null) => void;
  clearExternalChange: () => void;
  onBeforeConflictBaseline?: (conflict: IniConflictOccurrence, side: ConflictKeepSide) => void;
}): Promise<void> {
  const kept = input.choices.filter((choice) => canKeepConflictSide(choice.conflict, choice.side));
  if (kept.length === 0) return;
  const ops = kept.flatMap((choice) => {
    const op = semanticOpForKeptSide(choice.conflict, choice.side);
    return op === null ? [] : [op];
  });
  const adopt = (): void => {
    let nextPayload = input.payloadRef.current;
    let nextBaseline = input.baselineRef.current;
    for (const choice of kept) {
      input.onBeforeConflictBaseline?.(choice.conflict, choice.side);
      if (nextPayload !== null) nextPayload = payloadWithKeptValue(nextPayload, choice.conflict, choice.side);
      if (nextBaseline !== null) nextBaseline = payloadWithKeptValue(nextBaseline, choice.conflict, choice.side);
    }
    input.setPayload(nextPayload);
    input.setBaseline(nextBaseline);
    input.publishDirty(nextPayload, nextBaseline);
    let remaining = 0;
    input.setConflicts((prev) => {
      const rest = prev.filter((row) => !kept.some((choice) => sameConflictOccurrence(row, choice.conflict)));
      remaining = rest.length;
      return rest;
    });
    if (remaining === 0) {
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
      const result = await window.api.saveServerIniSemantic(input.serverId, ops);
      if (!result.ok) {
        input.setError(result.error ?? "Could not save the INI");
        input.setStaleDocument(true);
        const next = result.conflicts ?? [];
        input.setConflicts((prev) => [
          ...prev.filter((row) => !kept.some((choice) => sameConflictOccurrence(row, choice.conflict))),
          ...next,
        ]);
        return;
      }
      adopt();
    },
    () => {
      input.setBusy(false);
    },
  );
}
