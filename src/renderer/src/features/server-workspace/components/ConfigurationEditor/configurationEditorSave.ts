import { NAMED_ENGRAM_STALE_CODE, type NamedEngramEdit } from "@shared/ini/engram-named-entries";
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
  engramEdits?: readonly NamedEngramEdit[];
  /** A saved override line has no effect. Blocks Save only on Overrides. */
  engramBlocked?: boolean;
}): Promise<ConfigurationEditorSaveOutcome> {
  const sanitizedDraft = sanitizeServerIniPayload(input.draft);
  const sanitizedBaseline = sanitizeServerIniPayload(input.baseline);
  const resetEngrams = input.scope === undefined || input.scope === "engramOverrides";
  if (resetEngrams && input.engramBlocked === true) {
    return { ok: false, error: "Fix the engram line before saving.", conflict: false };
  }

  if (input.mode === "visual") {
    const scope = input.scope;
    const ops = buildIniSemanticOps(sanitizedBaseline, sanitizedDraft);
    const scopedOps = scope === undefined ? ops : ops.filter((op) => semanticOpInScope(op, scope));
    const engramEdits = resetEngrams ? (input.engramEdits ?? []) : [];
    const result =
      engramEdits.length > 0
        ? await window.api.saveServerIniSemantic(input.serverId, scopedOps, engramEdits)
        : await window.api.saveServerIniSemantic(input.serverId, scopedOps);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "Could not save the INI",
        conflict: result.code === INI_SEMANTIC_CONFLICT_CODE || result.code === NAMED_ENGRAM_STALE_CODE,
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
