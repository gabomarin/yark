import { NAMED_ENGRAM_STALE_CODE } from "@shared/ini/engram-named-entries";
import { SUPPLY_CRATE_STALE_CODE } from "@shared/ini/supply-crate-entries";
import { EMPTY_LINE_EDITS, type VisualLineEdits } from "@shared/ini/visual-line-edits";
import { INI_STALE_DOCUMENT_CODE } from "@shared/ini/ini-fingerprints";
import { buildIniSemanticOps, INI_SEMANTIC_CONFLICT_CODE } from "@shared/ini/ini-semantic-ops";
import type { IniFileFingerprints, IniPreview, ServerIniPayload } from "@shared/types";
import { sanitizeServerIniPayload } from "../../iniModel";
import {
  restoreUnsavedTextFile,
  restoreUnsavedVisualEdits,
  semanticOpInScope,
  textPayloadForScope,
  type IniSaveScope,
} from "./configurationEditorSaveScope";

export type { IniSaveScope };

export type ConfigurationEditorSaveMode = "visual" | "text";

export type ConfigurationEditorSaveOutcome =
  | {
      ok: true;
      savedPayload: ServerIniPayload;
      /** Saved files plus edits that belong to the other views. */
      draftPayload: ServerIniPayload;
      /** Overrides Save consumed the named-engram draft. */
      resetEngrams: boolean;
      /** Loot Save consumed the supply-crate draft. */
      resetLoot: boolean;
      preview: IniPreview;
      fingerprints: IniFileFingerprints;
      pending: boolean;
      changedCount: number;
    }
  | {
      ok: false;
      error: string;
      /** True when Save lost a race with an overlapping external edit. */
      conflict: boolean;
    };

/**
 * Visual → semantic Set/Unset onto latest disk (#667).
 * Raw/text → full-buffer save with fingerprints (#665).
 */
export async function performConfigurationEditorSave(input: {
  serverId: string;
  mode: ConfigurationEditorSaveMode;
  draft: ServerIniPayload;
  baseline: ServerIniPayload;
  expectedFingerprints: IniFileFingerprints;
  /** Open view. Omitted saves every visual change, which the editor no longer does. */
  scope?: IniSaveScope;
  lineEdits?: VisualLineEdits;
  /** A saved override line has no effect. Blocks Save only on Overrides. */
  engramBlocked?: boolean;
}): Promise<ConfigurationEditorSaveOutcome> {
  const sanitizedDraft = sanitizeServerIniPayload(input.draft);
  const sanitizedBaseline = sanitizeServerIniPayload(input.baseline);
  const lineEdits = input.lineEdits ?? EMPTY_LINE_EDITS;
  const resetEngrams = input.scope === undefined || input.scope === "engramOverrides";
  const resetLoot = input.scope === "loot";
  if (resetEngrams && input.engramBlocked === true) {
    return { ok: false, error: "Fix the engram line before saving.", conflict: false };
  }
  if (resetLoot && lineEdits.lootBlocked) {
    return { ok: false, error: "Fix the loot line before saving.", conflict: false };
  }

  if (input.mode === "visual") {
    const scope = input.scope;
    const ops = buildIniSemanticOps(sanitizedBaseline, sanitizedDraft);
    const scopedOps = scope === undefined ? ops : ops.filter((op) => semanticOpInScope(op, scope));
    const engramEdits = resetEngrams ? lineEdits.engrams : [];
    const lootEdits = resetLoot ? lineEdits.crates : [];
    let result;
    if (lootEdits.length > 0) {
      result = await window.api.saveServerIniSemantic(input.serverId, scopedOps, engramEdits, lootEdits);
    } else if (engramEdits.length > 0) {
      result = await window.api.saveServerIniSemantic(input.serverId, scopedOps, engramEdits);
    } else {
      result = await window.api.saveServerIniSemantic(input.serverId, scopedOps);
    }
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "Could not save the INI",
        conflict:
          result.code === INI_SEMANTIC_CONFLICT_CODE ||
          result.code === NAMED_ENGRAM_STALE_CODE ||
          result.code === SUPPLY_CRATE_STALE_CODE,
      };
    }
    const savedPayload = sanitizeServerIniPayload(result.data.payload);
    return {
      ok: true,
      savedPayload,
      draftPayload:
        scope === undefined
          ? savedPayload
          : restoreUnsavedVisualEdits(savedPayload, sanitizedBaseline, sanitizedDraft, scope),
      resetEngrams,
      resetLoot,
      preview: result.data,
      fingerprints: result.data.fingerprints,
      pending: result.data.pending,
      changedCount: result.data.changedCount,
    };
  }

  const scope = input.scope;
  const sent = scope === undefined ? sanitizedDraft : textPayloadForScope(sanitizedDraft, sanitizedBaseline, scope);
  const result = await window.api.saveServerIni(input.serverId, sent, input.expectedFingerprints);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "Could not save the INI",
      conflict: result.code === INI_STALE_DOCUMENT_CODE,
    };
  }
  return {
    ok: true,
    savedPayload: sent,
    draftPayload: scope === undefined ? sent : restoreUnsavedTextFile(sent, sanitizedDraft, scope),
    resetEngrams,
    resetLoot,
    preview: result.data,
    fingerprints: result.data.fingerprints,
    pending: result.data.pending,
    changedCount: result.data.changedCount,
  };
}

export function configurationEditorSaveToastMessage(
  pending: boolean,
  changedCount: number,
): {
  title: string;
  message: string;
} {
  if (pending) {
    return {
      title: "INI queued",
      message:
        changedCount > 0
          ? `Queued ${changedCount} change${changedCount === 1 ? "" : "s"} — applies when the server stops.`
          : "Queued with no changes — applies when the server stops.",
    };
  }
  return {
    title: "INI saved",
    message:
      changedCount > 0 ? `Saved ${changedCount} change${changedCount === 1 ? "" : "s"}.` : "Saved with no changes.",
  };
}
