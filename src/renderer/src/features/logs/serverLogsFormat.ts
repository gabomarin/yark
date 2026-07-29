import type { ServerUpdateLogFile } from "@shared/types";

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
    title: new Date(modifiedAt).toLocaleString(),
    subtitle,
  };
}
