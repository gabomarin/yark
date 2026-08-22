const READY_LOG_PATTERNS: readonly RegExp[] = [
  /server has completed startup/i,
  /now advertising/i,
  /full startup/i,
  /started listening/i,
  /rcon.*listening/i,
  /lognet:.*listen/i,
];

export const DEFAULT_READY_PROBE_MIN_WAIT_MS = 45_000;
export const DEFAULT_READY_SETTLE_MS = 15_000;
export const RCON_PROBE_TIMEOUT_MS = 2500;

export function hasReadyLogLine(lines: readonly string[]): boolean {
  return lines.some((line) =>
    READY_LOG_PATTERNS.some((pattern) => pattern.test(line)),
  );
}

export function shouldDelayRconProbe(input: {
  sawLogSignal: boolean;
  elapsedMs: number;
  minWaitMs?: number;
}): boolean {
  const minWaitMs = input.minWaitMs ?? DEFAULT_READY_PROBE_MIN_WAIT_MS;
  return !input.sawLogSignal && input.elapsedMs < minWaitMs;
}

export function formatReadyBootWaitMessage(minWaitMs: number): string {
  return `Waiting for startup to progress before RCON probes (min ${Math.round(minWaitMs / 1000)}s or log signal)…`;
}

export function formatReadyProbeStartMessage(sawLogSignal: boolean): string {
  return sawLogSignal
    ? "Startup signal detected in logs; checking RCON…"
    : "Minimum startup wait elapsed; checking RCON…";
}

export function formatReadySettleMessage(settleMs: number): string {
  return `RCON responded; waiting ${Math.round(settleMs / 1000)}s for the dedicated to finish settling…`;
}

export function formatReadySuccessMessage(): string {
  return "Server ready: RCON confirmed after settle (waiting for connections)";
}

export function formatReadyTimeoutError(): string {
  return "Timeout waiting for server readiness (RCON did not respond in time)";
}

export function formatReattachReadyWaitMessage(): string {
  return "Still waiting for RCON after Leave reattach; UI stays on starting";
}

const MAX_RUNTIME_LOG_LINES = 1200;

export function formatRuntimeLogLine(
  timestampIso: string,
  source: string,
  message: string,
): string {
  return `[${timestampIso}] [${source}] ${message}`;
}

export function appendRuntimeLogRing(
  lines: readonly string[],
  entry: string,
  maxLines: number = MAX_RUNTIME_LOG_LINES,
): string[] {
  const next = [...lines, entry];
  if (next.length <= maxLines) {
    return next;
  }
  return next.slice(next.length - maxLines);
}

export function splitRuntimeLogChunk(
  previousBuffer: string,
  chunk: string,
): { completeLines: string[]; remainder: string } {
  const combined = `${previousBuffer}${chunk}`;
  const parts = combined.split(/\r?\n/);
  const remainder = parts.pop() ?? "";
  const completeLines: string[] = [];
  for (const line of parts) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      completeLines.push(trimmed);
    }
  }
  return { completeLines, remainder };
}

export const RUNTIME_LOG_SOURCES = ["stdout", "stderr", "log"] as const;
export type RuntimeLogSource = (typeof RUNTIME_LOG_SOURCES)[number];

export function runtimeLogPartialKey(
  serverId: string,
  source: RuntimeLogSource,
): string {
  return `${serverId}\0${source}`;
}
