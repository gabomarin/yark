import { getCurseForgeAsaModUrlError } from "./curseforge-url";
import type { ModMetadata } from "./types";

/** Default references resolved per persist/progress batch. */
const MOD_ADD_URL_BATCH_SIZE = 5;

/** Numeric CurseForge Project ID (same rule as backend `normalizeModId`). */
export function isCurseForgeProjectId(raw: string): boolean {
  return /^\d+$/.test(raw.trim());
}

export interface InvalidModAddToken {
  raw: string;
  reason: string;
}

export interface ParsedModAddInput {
  ids: string[];
  urls: string[];
  invalid: InvalidModAddToken[];
}

/**
 * Parse Add-mod input: comma-separated Project IDs and/or ASA CurseForge mod URLs.
 */
export function parseModAddInput(raw: string): ParsedModAddInput {
  const ids: string[] = [];
  const urls: string[] = [];
  const invalid: InvalidModAddToken[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  for (const part of raw.split(",")) {
    const token = part.trim();
    if (token.length === 0) continue;

    if (isCurseForgeProjectId(token)) {
      if (!seenIds.has(token)) {
        seenIds.add(token);
        ids.push(token);
      }
      continue;
    }

    const urlError = getCurseForgeAsaModUrlError(token);
    if (urlError === null) {
      if (!seenUrls.has(token)) {
        seenUrls.add(token);
        urls.push(token);
      }
      continue;
    }

    if (/^https?:\/\//i.test(token) || /curseforge\.com/i.test(token)) {
      invalid.push({ raw: token, reason: urlError });
      continue;
    }

    invalid.push({
      raw: token,
      reason: "Not a numeric CurseForge Project ID or ASA mod URL.",
    });
  }

  return { ids, urls, invalid };
}

export function formatInvalidModAddTokens(
  invalid: InvalidModAddToken[],
): string {
  return invalid
    .map((entry) => `"${entry.raw}" (${entry.reason})`)
    .join("; ");
}

export interface ModAddApplyState {
  configuredIds: string[];
  disabledIds: string[];
  cache: Record<string, ModMetadata>;
}

export interface ModAddImportProgress {
  completed: number;
  total: number;
  succeeded: number;
  failed: number;
  batchIndex: number;
  batchCount: number;
}

export type ModAddApplyOutcome =
  | {
    status: "validation-error";
    message: string;
  }
  | {
    status: "ready";
    next: ModAddApplyState;
    clearInput: boolean;
    warning: string | null;
    error: string | null;
  };

type FetchDetailResult =
  | { ok: true; data: ModMetadata }
  | { ok: false; error: string };

export interface PrepareModAddApplyOptions {
  batchSize?: number;
  onProgress?: (progress: ModAddImportProgress) => void;
  /** Called after each batch that added or refreshed at least one mod. */
  onBatchComplete?: (next: ModAddApplyState) => void | Promise<void>;
}

/**
 * Resolve IDs/URLs in batches via the Worker-backed fetch callback.
 * Nothing is persisted for references CurseForge cannot verify as ASA mods.
 */
export async function prepareModAddApply(
  raw: string,
  current: ModAddApplyState,
  fetchDetail: (ref: string) => Promise<FetchDetailResult>,
  options: PrepareModAddApplyOptions = {},
): Promise<ModAddApplyOutcome> {
  const parsed = parseModAddInput(raw);
  const refs = [...parsed.ids, ...parsed.urls];
  if (refs.length === 0) {
    return {
      status: "validation-error",
      message:
        parsed.invalid.length === 0
          ? "Enter a CurseForge Project ID or ASA mod URL."
          : `No valid mods to add. Skipped: ${formatInvalidModAddTokens(parsed.invalid)}`,
    };
  }

  const batchSize = Math.max(1, options.batchSize ?? MOD_ADD_URL_BATCH_SIZE);
  const batchCount = Math.max(1, Math.ceil(refs.length / batchSize));
  let nextIds = [...current.configuredIds];
  const nextIdSet = new Set(nextIds);
  let nextDisabled = [...current.disabledIds];
  let nextCache = { ...current.cache };
  const resolutionFailures: string[] = [];
  let completed = 0;
  let succeeded = 0;
  let failed = 0;

  const emitProgress = (batchIndex: number) => {
    options.onProgress?.({
      completed,
      total: refs.length,
      succeeded,
      failed,
      batchIndex,
      batchCount,
    });
  };

  emitProgress(refs.length === 0 ? 0 : 1);

  for (let batchStart = 0; batchStart < refs.length; batchStart += batchSize) {
    const batchIndex = Math.floor(batchStart / batchSize) + 1;
    const batchRefs = refs.slice(batchStart, batchStart + batchSize);
    let batchChanged = false;

    for (const ref of batchRefs) {
      const result = await fetchDetail(ref);
      completed += 1;
      if (!result.ok) {
        failed += 1;
        resolutionFailures.push(`"${ref}" (${result.error})`);
        emitProgress(batchIndex);
        continue;
      }
      const detailError = getResolvedDetailError(result.data);
      if (detailError !== null) {
        failed += 1;
        resolutionFailures.push(`"${ref}" (${detailError})`);
        emitProgress(batchIndex);
        continue;
      }
      const detailData = result.data;
      if (!nextIdSet.has(detailData.id)) {
        nextIds = [...nextIds, detailData.id];
        nextIdSet.add(detailData.id);
        // New mods start disabled; operator enables explicitly.
        if (!nextDisabled.includes(detailData.id)) {
          nextDisabled = [...nextDisabled, detailData.id];
        }
        batchChanged = true;
      }
      nextCache = { ...nextCache, [detailData.id]: detailData };
      succeeded += 1;
      batchChanged = true;
      emitProgress(batchIndex);
    }

    if (batchChanged) {
      await options.onBatchComplete?.({
        configuredIds: nextIds,
        disabledIds: nextDisabled,
        cache: nextCache,
      });
    }
  }

  const hadWork = succeeded > 0;
  const skipParts: string[] = [];
  if (parsed.invalid.length > 0) {
    skipParts.push(`Skipped: ${formatInvalidModAddTokens(parsed.invalid)}`);
  }
  if (resolutionFailures.length > 0) {
    skipParts.push(
      `Could not verify as ASA mod(s): ${resolutionFailures.join("; ")}`,
    );
  }
  const skipMessage = skipParts.length > 0 ? skipParts.join(" ") : null;

  return {
    status: "ready",
    next: {
      configuredIds: nextIds,
      disabledIds: nextDisabled,
      cache: nextCache,
    },
    clearInput: hadWork,
    warning: hadWork ? skipMessage : null,
    error: hadWork ? null : skipMessage,
  };
}

function getResolvedDetailError(detail: ModMetadata): string | null {
  if (!isCurseForgeProjectId(detail.id)) {
    return "CurseForge returned an invalid Project ID";
  }
  const urlError = getCurseForgeAsaModUrlError(detail.curseforgeUrl);
  if (urlError !== null) {
    return `CurseForge returned a non-ASA project: ${urlError}`;
  }
  return null;
}

export function formatModAddImportProgress(
  progress: ModAddImportProgress,
): string {
  if (progress.total === 0) return "Importing mods…";
  return `Importing mods ${progress.completed}/${progress.total} (batch ${progress.batchIndex}/${progress.batchCount})`;
}
