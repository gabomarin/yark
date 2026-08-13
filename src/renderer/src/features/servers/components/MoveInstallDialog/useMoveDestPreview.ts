import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import type { FleetInstallRef } from "@shared/server-install-path";
import type { ImportInstallProbe } from "@shared/types";
import { moveDestPreviewIssue } from "./moveInstallPathWarning";

export function useMoveDestPreview(options: {
  opened: boolean;
  destDir: string;
  sourceDir: string;
  excludeId: string | undefined;
  fleet: readonly FleetInstallRef[];
}): { previewIssue: string | null; probePending: boolean } {
  const dest = options.destDir.trim();
  const [debouncedDest] = useDebouncedValue(dest, 400);
  const [probe, setProbe] = useState<ImportInstallProbe | null>(null);
  const [probeSettled, setProbeSettled] = useState(false);

  const syncIssue = useMemo(
    () =>
      options.excludeId === undefined || dest.length === 0
        ? null
        : moveDestPreviewIssue({
            sourceDir: options.sourceDir,
            destDir: dest,
            fleet: options.fleet,
            excludeId: options.excludeId,
            probe: null,
          }),
    [dest, options.excludeId, options.fleet, options.sourceDir],
  );

  useEffect(() => {
    if (!options.opened || debouncedDest.length === 0 || syncIssue !== null) {
      setProbe(null);
      setProbeSettled(true);
      return;
    }
    const probeFn = window.api?.probeImportInstall;
    if (typeof probeFn !== "function") {
      setProbe(null);
      setProbeSettled(true);
      return;
    }
    let cancelled = false;
    setProbeSettled(false);
    void probeFn(debouncedDest)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setProbe(result.ok ? result.data : null);
        setProbeSettled(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setProbe(null);
        setProbeSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedDest, options.opened, syncIssue]);

  const probePending =
    dest.length > 0 &&
    syncIssue === null &&
    (dest !== debouncedDest || !probeSettled);

  const previewIssue =
    options.excludeId === undefined || dest.length === 0
      ? null
      : moveDestPreviewIssue({
          sourceDir: options.sourceDir,
          destDir: dest,
          fleet: options.fleet,
          excludeId: options.excludeId,
          probe: dest === debouncedDest ? probe : null,
        });

  return { previewIssue, probePending };
}
