import type { ServerOperationalLogs, ServerUpdateLogFile } from "@shared/types";
import { formatLogDateTime } from "@shared/format-log-datetime";

/** Runtime buffer filter: lines are tagged `[iso] [source] …`. */
export type RuntimeLogSourceFilter = "all" | "system" | "asa" | "process";

export const RUNTIME_SOURCE_FILTER_OPTIONS: {
  value: RuntimeLogSourceFilter;
  label: string;
}[] = [
  { value: "all", label: "All sources" },
  { value: "system", label: "System" },
  { value: "asa", label: "Server log" },
  { value: "process", label: "Process (stdout/stderr)" },
];

const RUNTIME_LINE_SOURCE_RE = /^\[[^\]]+\] \[([a-z]+)\] /i;
const WRAPPED_RUNTIME_LINE_RE = /^\[([^\]]+)\] \[([a-z]+)\] (.*)$/is;
/** Unreal / ASA: `[2026.07.29-21.42.52:443][  5]Message` */
const UNREAL_LOG_STAMP_RE =
  /^\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\](\[\s*\d+\])?(.*)$/s;

export function parseRuntimeLogSource(line: string): string | null {
  const match = RUNTIME_LINE_SOURCE_RE.exec(line);
  return match?.[1]?.toLowerCase() ?? null;
}

export function filterRuntimeLogLines(
  lines: string[],
  filter: RuntimeLogSourceFilter,
): string[] {
  if (filter === "all") return lines;
  return lines.filter((line) => {
    const source = parseRuntimeLogSource(line);
    if (source === null) return false;
    if (filter === "system") {
      return source === "system" || source === "warning" || source === "error";
    }
    if (filter === "asa") return source === "log";
    return source === "stdout" || source === "stderr";
  });
}

export function preserveNewerRuntimeLogs(
  incoming: ServerOperationalLogs,
  previous: ServerOperationalLogs | null,
  runtimeChanged: boolean,
): ServerOperationalLogs {
  if (!runtimeChanged || previous?.serverId !== incoming.serverId) return incoming;
  return { ...incoming, runtimeLogLines: previous.runtimeLogLines };
}

export function replaceRuntimeLogs(
  logs: ServerOperationalLogs | null,
  serverId: string,
  runtimeLogLines: string[],
): ServerOperationalLogs | null {
  if (logs?.serverId !== serverId) return logs;
  return { ...logs, runtimeLogLines };
}

/**
 * Rewrites an Unreal stamp (UTC wall clock in the file) to local log datetime.
 * Returns null when the body does not start with that stamp.
 */
export function formatUnrealLogBody(body: string): string | null {
  const match = UNREAL_LOG_STAMP_RE.exec(body);
  if (match === null) return null;
  const utcDate = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
      Number(match[7]),
    ),
  );
  const stamp = formatLogDateTime(utcDate, { includeMs: true });
  const frameRaw = match[8];
  const frame =
    frameRaw !== undefined && frameRaw.length > 0
      ? frameRaw.replace(/\[\s*(\d+)\s*\]/, "[$1]")
      : "";
  const rest = (match[9] ?? "").replace(/^\s+/, "");
  return [stamp, frame, rest].filter((part) => part.length > 0).join(" ");
}

/**
 * Viewer-facing line: never show the YARK capture ISO. For server (`log`) lines,
 * keep only the Unreal wall-clock stamp; other sources keep `[source] body`.
 */
export function formatRuntimeLogLineForDisplay(line: string): string {
  const wrapped = WRAPPED_RUNTIME_LINE_RE.exec(line);
  if (wrapped === null) return line;
  const source = wrapped[2]!.toLowerCase();
  const body = wrapped[3] ?? "";

  if (source === "log") {
    return formatUnrealLogBody(body) ?? body;
  }

  return `[${source}] ${body}`;
}

export function formatRuntimeLogLinesForDisplay(lines: string[]): string[] {
  return lines.map((line) => formatRuntimeLogLineForDisplay(line));
}

export function formatSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  const seconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${rest}s`;
  }
  return `${rest}s`;
}

export function statusColor(status: ServerUpdateLogFile["status"]): string {
  if (status === "success") return "green";
  if (status === "failed") return "red";
  return "gray";
}

export function statusLabel(status: ServerUpdateLogFile["status"]): string {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  return "Unknown";
}

/** Prefer a readable stamp over the full `{uuid}-{iso}.log` filename. */
export function formatUpdateJobLabel(
  fileName: string,
  modifiedAt: string,
): {
  title: string;
  subtitle: string;
} {
  const withoutExt = fileName.replace(/\.log$/i, "");
  const stampMatch = withoutExt.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/);
  const rawStamp = stampMatch?.[1];
  const subtitle =
    rawStamp !== undefined
      ? rawStamp.replace(
          /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})$/,
          "$1 $2:$3:$4",
        )
      : withoutExt.slice(-24);
  return {
    title: formatLogDateTime(modifiedAt, { fallback: modifiedAt }),
    subtitle,
  };
}
