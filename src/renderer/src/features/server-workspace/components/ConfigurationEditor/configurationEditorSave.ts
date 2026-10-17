import { INI_STALE_DOCUMENT_CODE } from "@shared/ini/ini-fingerprints";
import { buildIniSemanticOps, INI_SEMANTIC_CONFLICT_CODE } from "@shared/ini/ini-semantic-ops";
import type { IniFileFingerprints, IniPreview, ServerIniPayload } from "@shared/types";
import { sanitizeServerIniPayload } from "../../iniModel";

export type ConfigurationEditorSaveMode = "visual" | "text";

export type ConfigurationEditorSaveOutcome =
  | {
      ok: true;
      savedPayload: ServerIniPayload;
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
}): Promise<ConfigurationEditorSaveOutcome> {
  const sanitizedDraft = sanitizeServerIniPayload(input.draft);
  const sanitizedBaseline = sanitizeServerIniPayload(input.baseline);

  if (input.mode === "visual") {
    const result = await window.api.saveServerIniSemantic(
      input.serverId,
      buildIniSemanticOps(sanitizedBaseline, sanitizedDraft),
    );
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "Could not save the INI",
        conflict: result.code === INI_SEMANTIC_CONFLICT_CODE,
      };
    }
    return {
      ok: true,
      savedPayload: sanitizeServerIniPayload(result.data.payload),
      preview: result.data,
      fingerprints: result.data.fingerprints,
      pending: result.data.pending,
      changedCount: result.data.changedCount,
    };
  }

  const result = await window.api.saveServerIni(input.serverId, sanitizedDraft, input.expectedFingerprints);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "Could not save the INI",
      conflict: result.code === INI_STALE_DOCUMENT_CODE,
    };
  }
  return {
    ok: true,
    savedPayload: sanitizedDraft,
    preview: result.data,
    fingerprints: result.data.fingerprints,
    pending: result.data.pending,
    changedCount: result.data.changedCount,
  };
}

export function configurationEditorSaveToastMessage(pending: boolean, changedCount: number): {
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
      changedCount > 0
        ? `Saved ${changedCount} change${changedCount === 1 ? "" : "s"}.`
        : "Saved with no changes.",
  };
}
