import type { ProcessMetricsUpdatedPush } from "@shared/ipc";
import type { ServerStatus } from "@shared/types";

/** Per-server process sample from the ListPlayers-style push cache (#302). */
export type ProcessMetricsSnapshot = ProcessMetricsUpdatedPush | null;

export function formatWorkingSet(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) {
    return "–";
  }
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 10) {
    return `${gb.toFixed(1)} GB`;
  }
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${Math.round(mb)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

export function formatCpuPercent(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct) || pct < 0) {
    return "–";
  }
  if (pct >= 100) {
    return `${Math.round(pct)}%`;
  }
  return `${Math.round(pct * 10) / 10}%`;
}

/**
 * Merged meta cell for Overview cards. Unknown / not running → `–`.
 * CPU is % of one logical processor (#302).
 */
export function formatServerRamCpuMeta(input: {
  status: ServerStatus;
  metrics: ProcessMetricsSnapshot;
}): string {
  if (input.status !== "running" && input.status !== "starting") {
    return "–";
  }
  const metrics = input.metrics;
  if (metrics == null || metrics.error != null) {
    return "–";
  }
  if (metrics.workingSetBytes == null && metrics.cpuPercent == null) {
    return "–";
  }
  return `${formatWorkingSet(metrics.workingSetBytes)} · ${formatCpuPercent(metrics.cpuPercent)}`;
}

export function sumFleetWorkingSetBytes(input: {
  enabledServers: ReadonlyArray<{ id: string }>;
  statuses: Map<string, { status: ServerStatus }>;
  metricsByServer: Map<string, ProcessMetricsUpdatedPush>;
}): number | null {
  let total = 0;
  let hasSample = false;
  for (const server of input.enabledServers) {
    const status = input.statuses.get(server.id)?.status ?? "stopped";
    // Match card meta: live bootstrap (`starting`) already has a dedicated PID (#302).
    if (status !== "running" && status !== "starting") continue;
    const sample = input.metricsByServer.get(server.id);
    if (sample?.workingSetBytes == null || sample.error != null) continue;
    total += sample.workingSetBytes;
    hasSample = true;
  }
  return hasSample ? total : null;
}

/**
 * Sum of per-process CPU % (each = % of one logical processor) across
 * starting/running servers — host load signal, parallel to fleet RAM (#302).
 */
export function sumFleetCpuPercent(input: {
  enabledServers: ReadonlyArray<{ id: string }>;
  statuses: Map<string, { status: ServerStatus }>;
  metricsByServer: Map<string, ProcessMetricsUpdatedPush>;
}): number | null {
  let total = 0;
  let hasSample = false;
  for (const server of input.enabledServers) {
    const status = input.statuses.get(server.id)?.status ?? "stopped";
    if (status !== "running" && status !== "starting") continue;
    const sample = input.metricsByServer.get(server.id);
    if (sample?.cpuPercent == null || sample.error != null) continue;
    total += sample.cpuPercent;
    hasSample = true;
  }
  return hasSample ? Math.round(total * 10) / 10 : null;
}

/** True when any enabled profile is starting or running (header RAM/CPU gate). */
export function hasLiveProcessFleet(input: {
  enabledServers: ReadonlyArray<{ id: string }>;
  statuses: Map<string, { status: ServerStatus }>;
}): boolean {
  for (const server of input.enabledServers) {
    const status = input.statuses.get(server.id)?.status ?? "stopped";
    if (status === "running" || status === "starting") {
      return true;
    }
  }
  return false;
}
