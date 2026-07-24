/**
 * Parseo de progreso a partir de líneas de salida de SteamCMD.
 */

export interface SteamCmdProgressParse {
  percent: number | null;
  label: string | null;
  /** Bytes ya procesados/descargados (si SteamCMD los reporta). */
  bytesDownloaded: number | null;
  /** Bytes totales del paquete (si SteamCMD los reporta). */
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

/** Convierte bytes a texto en MB (1 decimal). */
export function formatBytesAsMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/** Ej.: "512.3 / 2800.0 MB" */
export function formatSteamCmdByteProgress(downloaded: number, total: number): string {
  const downMb = (downloaded / (1024 * 1024)).toFixed(1);
  const totalMb = (total / (1024 * 1024)).toFixed(1);
  return `${downMb} / ${totalMb} MB`;
}

/**
 * Prefijo UI para el progreso en bytes según la operación.
 * SteamCMD reporta BytesDownloaded también al verificar.
 */
export function steamCmdByteProgressNoun(
  operation: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null | undefined,
): string {
  if (operation === "verify-files") {
    return "Comprobado";
  }
  if (operation === "sync-files") {
    return "Copiado";
  }
  return "Descargado";
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
      percent: 100,
      label: "Instalación completada",
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
    let label = "Descargando";
    if (state !== null) {
      if (state.includes("verif")) label = "Verificando";
      else if (state.includes("prealloc")) label = "Preparando disco";
      else if (state.includes("commit") || state.includes("staging")) label = "Aplicando";
      else if (state.includes("download")) label = "Descargando";
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
      label: "Descarga completada",
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
