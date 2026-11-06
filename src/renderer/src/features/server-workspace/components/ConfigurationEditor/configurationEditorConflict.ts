import {
  canKeepConflictSide,
  payloadWithKeptChoices,
  sameConflictOccurrence,
  semanticOpForKeptSide,
  type ConflictKeepSide,
  type IniConflictOccurrence,
} from "@shared/ini/ini-conflict";
import {
  applyIniSemanticOps,
  buildIniSemanticOps,
  getIniTextValueAt,
  type IniSemanticOp,
} from "@shared/ini/ini-semantic-ops";
import type { IniFileKey, ServerIniPayload, ServerIniSnapshot } from "@shared/types";
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
  const adopt = (nextPayload: ServerIniPayload | null, nextBaseline: ServerIniPayload | null): void => {
    input.onBeforeConflictBaseline?.(kept);
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
    adopt(
      input.payloadRef.current === null ? null : payloadWithKeptChoices(input.payloadRef.current, kept),
      input.baselineRef.current === null ? null : payloadWithKeptChoices(input.baselineRef.current, kept),
    );
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
        const saved = sanitizeServerIniPayload(result.data.payload);
        input.setSnapshot((prev) =>
          adoptIniSaveSnapshot(prev, {
            payload: saved,
            fingerprints: result.data.fingerprints,
            pending: result.data.pending,
          }),
        );
        adopt(payloadAfterConflictAccept(saved, input.baselineRef.current, input.payloadRef.current, kept), saved);
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

function fileText(payload: ServerIniPayload, fileKey: IniFileKey): string {
  return fileKey === "gameUserSettings" ? payload.gameUserSettings : payload.game;
}

function resolvesKeptConflict(op: IniSemanticOp, kept: readonly ConflictChoice[]): boolean {
  return kept.some((choice) => {
    const conflict = choice.conflict;
    return (
      op.fileKey === conflict.fileKey &&
      op.section.trim().toLowerCase() === conflict.section.trim().toLowerCase() &&
      op.key.trim().toLowerCase() === conflict.key.trim().toLowerCase() &&
      op.occurrence === conflict.occurrence
    );
  });
}

function withoutKeyList(op: IniSemanticOp): IniSemanticOp {
  if (op.kind === "unset") {
    return {
      kind: "unset",
      fileKey: op.fileKey,
      section: op.section,
      key: op.key,
      occurrence: op.occurrence,
      expectedPreviousValue: op.expectedPreviousValue ?? "",
    };
  }
  if (op.kind === "check") {
    return {
      kind: "check",
      fileKey: op.fileKey,
      section: op.section,
      key: op.key,
      occurrence: op.occurrence,
      expectedPreviousValue: op.expectedPreviousValue,
    };
  }
  return {
    kind: "set",
    fileKey: op.fileKey,
    section: op.section,
    key: op.key,
    occurrence: op.occurrence,
    expectedPreviousValue: op.expectedPreviousValue,
    nextValue: op.nextValue,
  };
}

/**
 * The saved file already includes the accepted choices and any other disk edits.
 * Draft edits that were not part of the review stay on top of that file.
 */
export function payloadAfterConflictAccept(
  saved: ServerIniPayload,
  baseline: ServerIniPayload | null,
  draft: ServerIniPayload | null,
  kept: readonly ConflictChoice[],
): ServerIniPayload {
  if (baseline === null || draft === null) return saved;
  const applicable = buildIniSemanticOps(baseline, draft)
    .filter((op) => !resolvesKeptConflict(op, kept))
    .filter((op) => op.kind !== "unset" || op.expectedPreviousValue !== null)
    .filter(
      (op) =>
        getIniTextValueAt(fileText(saved, op.fileKey), op.section, op.key, op.occurrence) === op.expectedPreviousValue,
    )
    .map(withoutKeyList);
  if (applicable.length === 0) return saved;
  return applyIniSemanticOps(saved, applicable);
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
