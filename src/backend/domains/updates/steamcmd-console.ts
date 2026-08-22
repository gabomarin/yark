/** Ring buffer cap for the Downloads SteamCMD console snapshot. */
export const STEAMCMD_CONSOLE_MAX_LINES = 500;

/** Default throttle for logging progress ticks to the console (not the progress bar). */
export const STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_MS = 1500;
export const STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_DELTA = 2;

/** Minimum percent delta before a progress push is considered a change. */
const STEAMCMD_PROGRESS_PERCENT_MIN_DELTA = 0.05;

export function clampSteamCmdConsoleLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 200;
}

export function formatTimestampedSteamCmdLine(timestampIso: string, line: string): string {
  return `[${timestampIso}] ${line}`;
}

export function trimSteamCmdConsoleRing(lines: readonly string[], maxLines: number): string[] {
  if (lines.length <= maxLines) {
    return [...lines];
  }
  return lines.slice(lines.length - maxLines);
}

export function appendSteamCmdConsoleRing(
  lines: readonly string[],
  entry: string,
  maxLines: number = STEAMCMD_CONSOLE_MAX_LINES,
): string[] {
  return trimSteamCmdConsoleRing([...lines, entry], maxLines);
}

/**
 * Split a SteamCMD stdout/stderr chunk on CR/LF boundaries.
 * Keeps the trailing partial line in `remainder` for the next chunk.
 */
export function splitSteamCmdOutputChunk(
  previousBuffer: string,
  chunk: string,
): { completeLines: string[]; remainder: string } {
  const combined = previousBuffer + String(chunk);
  const parts = combined.split(/\r\n|\n|\r/);
  const remainder = parts.pop() ?? "";
  const completeLines: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      completeLines.push(trimmed);
    }
  }
  return { completeLines, remainder };
}

/** Strip source prefixes and console_log timestamps from a SteamCMD line. */
export function stripSteamCmdBareLine(line: string): string {
  return line
    .replace(/^\[(?:(?:update|verify)\/(?:stdout|stderr)|console_log)\]\s*/i, "")
    .replace(/^\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*/, "")
    .trim();
}

/** Strip update/verify source prefix before parsing progress from appendSteamCmdConsole lines. */
export function stripSteamCmdProgressIngestPrefix(line: string): string {
  return line.replace(/^\[(?:update|verify)\/(?:stdout|stderr)\]\s*/i, "");
}

export function steamCmdProgressPercentChanged(
  previousPercent: number | null,
  newPercent: number | null,
  minDelta: number = STEAMCMD_PROGRESS_PERCENT_MIN_DELTA,
): boolean {
  if (previousPercent === null) {
    return newPercent !== null;
  }
  if (newPercent === null) {
    return false;
  }
  return Math.abs(newPercent - previousPercent) >= minDelta;
}

export function shouldLogProgressTickToConsole(input: {
  nowMs: number;
  lastLogAtMs: number;
  minLogIntervalMs?: number;
  parsedPercent: number | null;
  lastLoggedPercent: number | null;
  minPercentDelta?: number;
}): boolean {
  const minLogIntervalMs = input.minLogIntervalMs ?? STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_MS;
  const minPercentDelta = input.minPercentDelta ?? STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_DELTA;
  if (input.lastLoggedPercent === null) {
    return true;
  }
  if (input.parsedPercent === null) {
    return true;
  }
  if (Math.abs(input.parsedPercent - input.lastLoggedPercent) >= minPercentDelta) {
    return true;
  }
  return input.nowMs - input.lastLogAtMs >= minLogIntervalMs;
}
