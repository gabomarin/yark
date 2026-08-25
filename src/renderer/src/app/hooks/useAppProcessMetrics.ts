import { useEffect, useState } from "react";
import type { ProcessMetricsUpdatedPush } from "@shared/ipc";

function sameMetrics(
  left: ProcessMetricsUpdatedPush | undefined,
  right: ProcessMetricsUpdatedPush,
): boolean {
  if (left === undefined) return false;
  return (
    left.pid === right.pid
    && left.workingSetBytes === right.workingSetBytes
    && left.cpuPercent === right.cpuPercent
    && left.error === right.error
  );
}

function upsertProcessMetrics(
  prev: Map<string, ProcessMetricsUpdatedPush>,
  sample: ProcessMetricsUpdatedPush,
): Map<string, ProcessMetricsUpdatedPush> {
  const existing = prev.get(sample.serverId);
  // Cleared / unknown sample (pid 0 + nulls): drop the row.
  if (
    sample.pid <= 0
    && sample.workingSetBytes == null
    && sample.cpuPercent == null
  ) {
    if (existing === undefined) return prev;
    const next = new Map(prev);
    next.delete(sample.serverId);
    return next;
  }
  if (sameMetrics(existing, sample)) {
    return prev;
  }
  const next = new Map(prev);
  next.set(sample.serverId, sample);
  return next;
}

export function useAppProcessMetrics(): {
  processMetricsByServer: Map<string, ProcessMetricsUpdatedPush>;
} {
  const [processMetricsByServer, setProcessMetricsByServer] = useState(
    () => new Map<string, ProcessMetricsUpdatedPush>(),
  );

  useEffect(() => {
    const unsubscribe =
      typeof window.api.onProcessMetricsUpdated === "function"
        ? window.api.onProcessMetricsUpdated((payload) => {
            setProcessMetricsByServer((prev) =>
              upsertProcessMetrics(prev, payload),
            );
          })
        : () => undefined;
    return () => {
      unsubscribe();
    };
  }, []);

  return { processMetricsByServer };
}
