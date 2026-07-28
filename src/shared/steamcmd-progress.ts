/**
 * Parse progress from SteamCMD output lines.
 */

export interface SteamCmdProgressParse {
  percent: number | null;
  label: string | null;
  /** Bytes already processed/downloaded (if SteamCMD reports them). */
  bytesDownloaded: number | null;
  /** Total package bytes (if SteamCMD reports them). */
  bytesTotal: number | null;
}

const PROGRESS_RE = /progress:\s*([\d.]+)\s*(?:\(([^)]+)\))?/i;
const BYTES_PAIR_RE = /^\s*([\d.,]+)\s*\/\s*([\d.,]+)\s*$/;
const UPDATE_STATE_RE = /Update state\s*\([^)]*\)\s*([a-z ]+)/i;
const SUCCESS_RE = /Success!\s*App '?\d+'?\s*fully installed/i;
const DOWNLOAD_COMPLETE_RE = /Down(?:load|loaded)(?:ing)?\s+(?:item|update)?.*complete/i;

function parseNumberToken(raw: string): number | null {
  const normalized = raw.replace(/,/g, "").trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parseSteamCmdBytePair(detail: string): {
  downloaded: number | null;
  total: number | null;
} {
  const match = BYTES_PAIR_RE.exec(detail.trim());
  if (match === null) {
    return { downloaded: null, total: null };
  }
  return {
    downloaded: parseNumberToken(match[1]!),
    total: parseNumberToken(match[2]!),
  };
}

/** Formats bytes as MB text (1 decimal). */
export function formatBytesAsMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/** E.g. "512.3 / 2800.0 MB" */
export function formatSteamCmdByteProgress(downloaded: number, total: number): string {
  const downMb = (downloaded / (1024 * 1024)).toFixed(1);
  const totalMb = (total / (1024 * 1024)).toFixed(1);
  return `${downMb} / ${totalMb} MB`;
}

/**
 * True when byte counters are worth showing in the UI.
 * Rejects nulls and empty totals (e.g. stale `0 / 0 MB` left over before robocopy sync).
 */
export function hasMeaningfulSteamCmdByteProgress(
  downloaded: number | null | undefined,
  total: number | null | undefined,
): boolean {
  return (
    downloaded != null
    && total != null
    && Number.isFinite(downloaded)
    && Number.isFinite(total)
    && total > 0
  );
}

/**
 * UI noun prefix for byte progress by operation.
 * SteamCMD also reports BytesDownloaded when verifying.
 */
export function steamCmdByteProgressNoun(
  operation: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null | undefined,
): string {
  if (operation === "verify-files") {
    return "Checked";
  }
  if (operation === "sync-files") {
    return "Copied";
  }
  return "Downloaded";
}

function emptyParse(): SteamCmdProgressParse {
  return { percent: null, label: null, bytesDownloaded: null, bytesTotal: null };
}

export function parseSteamCmdProgressLine(line: string): SteamCmdProgressParse {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return emptyParse();
  }

  if (SUCCESS_RE.test(trimmed) || /fully installed/i.test(trimmed)) {
    return {
      // SteamCMD phase complete; robocopy sync is a separate indeterminate step.
      percent: 100,
      label: "SteamCMD finished — preparing file sync",
      bytesDownloaded: null,
      bytesTotal: null,
    };
  }

  const progressMatch = PROGRESS_RE.exec(trimmed);
  if (progressMatch !== null) {
    const raw = Number(progressMatch[1]);
    const percent = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : null;
    const detail = progressMatch[2]?.trim();
    const bytes = detail !== undefined ? parseSteamCmdBytePair(detail) : { downloaded: null, total: null };
    const stateMatch = UPDATE_STATE_RE.exec(trimmed);
    const state = stateMatch?.[1]?.trim().toLowerCase() ?? null;
    let label = "Downloading";
    if (state !== null) {
      if (state.includes("verif")) label = "Verifying";
      else if (state.includes("prealloc")) label = "Preparing disk";
      else if (state.includes("commit") || state.includes("staging")) label = "Applying";
      else if (state.includes("download")) label = "Downloading";
    }
    if (bytes.downloaded !== null && bytes.total !== null) {
      label = `${label} · ${formatSteamCmdByteProgress(bytes.downloaded, bytes.total)}`;
    }
    return {
      percent,
      label,
      bytesDownloaded: bytes.downloaded,
      bytesTotal: bytes.total,
    };
  }

  if (DOWNLOAD_COMPLETE_RE.test(trimmed)) {
    return {
      percent: null,
      label: "Download complete",
      bytesDownloaded: null,
      bytesTotal: null,
    };
  }

  const stateOnly = UPDATE_STATE_RE.exec(trimmed);
  if (stateOnly !== null) {
    return {
      percent: null,
      label: stateOnly[1]!.trim(),
      bytesDownloaded: null,
      bytesTotal: null,
    };
  }

  return emptyParse();
}
