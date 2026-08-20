import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import type { FleetInstallRef } from "@shared/server-install-path";
import type { ImportInstallProbe } from "@shared/types";
import { diskMoveInstallWarning } from "../ServerForm/createInstallPathWarning";
import { moveDestPreviewIssue } from "./moveInstallPathWarning";

const MOVE_DEST_PROBE_FAILED = "Could not check the destination folder.";

function probeFailureMessage(detail?: string): string {
  const trimmed = detail?.trim() ?? "";
  if (trimmed.length === 0) {
    return MOVE_DEST_PROBE_FAILED;
  }
  return `${MOVE_DEST_PROBE_FAILED} ${trimmed}`;
}

export function useMoveDestPreview(options: {
  opened: boolean;
  destDir: string;
  sourceDir: string;
  excludeId: string | undefined;
  fleet: readonly FleetInstallRef[];
}): { previewIssue: string | null; probePending: boolean; destVacant: boolean } {
  const dest = options.destDir.trim();
  const [debouncedDest] = useDebouncedValue(dest, 400);
  const [probe, setProbe] = useState<ImportInstallProbe | null>(null);
  const [probeSettled, setProbeSettled] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

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
      setProbeError(null);
      setProbeSettled(true);
      return;
    }
    const probeFn = window.api?.probeImportInstall;
    if (typeof probeFn !== "function") {
      setProbe(null);
      setProbeError(MOVE_DEST_PROBE_FAILED);
      setProbeSettled(true);
      return;
    }
    let cancelled = false;
    setProbeSettled(false);
    setProbeError(null);
    void probeFn(debouncedDest)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setProbe(null);
          setProbeError(probeFailureMessage(result.error));
          setProbeSettled(true);
          return;
        }
        setProbe(result.data);
        setProbeError(null);
        setProbeSettled(true);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setProbe(null);
        setProbeError(
          probeFailureMessage(error instanceof Error ? error.message : undefined),
        );
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

  const destVacant =
    dest.length > 0 &&
    dest === debouncedDest &&
    probe !== null &&
    probeError === null &&
    diskMoveInstallWarning(probe) === null;

  const previewIssue =
    options.excludeId === undefined || dest.length === 0
      ? null
      : (syncIssue ??
        (dest === debouncedDest ? probeError : null) ??
        moveDestPreviewIssue({
          sourceDir: options.sourceDir,
          destDir: dest,
          fleet: options.fleet,
          excludeId: options.excludeId,
          probe: dest === debouncedDest ? probe : null,
        }));

  return { previewIssue, probePending, destVacant };
}
