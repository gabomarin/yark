import { execFileBounded } from "./exec-file-bounded";

export interface WindowsProcessResourceRow {
  pid: number;
  /** Working set bytes (WorkingSet64). */
  workingSetBytes: number;
  /** Cumulative CPU time in seconds (Get-Process CPU). */
  cpuSeconds: number;
}

const QUERY_TIMEOUT_MS = 8_000;

/** Build the -Command body for a batch WorkingSet/CPU sample (#302). */
export function buildWindowsProcessResourcesCommand(
  safePids: ReadonlyArray<number>,
): string {
  const idList = safePids.join(",");
  // Newlines (not `;`) so script-block braces stay valid PowerShell.
  return [
    `$ids = @(${idList})`,
    `$rows = @(Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object {`,
    `  [pscustomobject]@{`,
    `    ProcessId = [int]$_.Id`,
    `    WorkingSet64 = [int64]$_.WorkingSet64`,
    `    CpuSeconds = [double]$_.CPU`,
    `  }`,
    `})`,
    `if ($rows.Count -eq 0) { '' } else { $rows | ConvertTo-Json -Compress }`,
  ].join("\n");
}

/**
 * Batch-sample WorkingSet64 + cumulative CPU seconds for many PIDs in one
 * PowerShell call (#302 / #145). Only integer PIDs are interpolated.
 */
export async function queryWindowsProcessResources(
  pids: ReadonlyArray<number>,
): Promise<Map<number, WindowsProcessResourceRow>> {
  const out = new Map<number, WindowsProcessResourceRow>();
  if (process.platform !== "win32") {
    return out;
  }
  const safePids = [
    ...new Set(
      pids.filter((pid) => Number.isInteger(pid) && pid > 0),
    ),
  ];
  if (safePids.length === 0) {
    return out;
  }

  const script = buildWindowsProcessResourcesCommand(safePids);

  try {
    const { stdout } = await execFileBounded(
      "powershell.exe",
      ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", script],
      {
        timeoutMs: QUERY_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );
    const raw = stdout.trim();
    if (raw.length === 0) {
      return out;
    }
    const parsed = JSON.parse(raw) as
      | Array<{ ProcessId?: number; WorkingSet64?: number; CpuSeconds?: number }>
      | { ProcessId?: number; WorkingSet64?: number; CpuSeconds?: number };
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    for (const row of rows) {
      const pid = row.ProcessId;
      const workingSetBytes = row.WorkingSet64;
      const cpuSeconds = row.CpuSeconds;
      if (
        typeof pid !== "number"
        || !Number.isInteger(pid)
        || pid <= 0
        || typeof workingSetBytes !== "number"
        || !Number.isFinite(workingSetBytes)
        || workingSetBytes < 0
        || typeof cpuSeconds !== "number"
        || !Number.isFinite(cpuSeconds)
        || cpuSeconds < 0
      ) {
        continue;
      }
      out.set(pid, {
        pid,
        workingSetBytes: Math.round(workingSetBytes),
        cpuSeconds,
      });
    }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[yark] queryWindowsProcessResources failed: ${detail}`);
  }
  return out;
}

/**
 * CPU % of **one** logical processor from cumulative CPU-second deltas (#302).
 * Returns null when wall or cpu delta is unusable (first tick / clock skew).
 */
export function cpuPercentFromDeltas(input: {
  prevCpuSeconds: number;
  nextCpuSeconds: number;
  prevAtMs: number;
  nextAtMs: number;
}): number | null {
  const wallSec = (input.nextAtMs - input.prevAtMs) / 1000;
  if (!(wallSec > 0.05)) {
    return null;
  }
  const cpuDelta = input.nextCpuSeconds - input.prevCpuSeconds;
  if (!(cpuDelta >= 0) || !Number.isFinite(cpuDelta)) {
    return null;
  }
  // One logical processor: 1.0 CPU-second per wall-second = 100%.
  const pct = (cpuDelta / wallSec) * 100;
  if (!Number.isFinite(pct)) {
    return null;
  }
  return Math.min(999, Math.round(pct * 10) / 10);
}
