import { Badge, Tooltip } from "@mantine/core";
import type { CrashRecoveryRuntime } from "@shared/types";
import type { ReactElement } from "react";
import { useCrashRecoveryCountdown } from "../hooks/useCrashRecoveryCountdown";
import {
  CRASH_RECOVERY_NOTICE_COLOR,
  crashRecoveryAttemptTooltip,
  crashRecoveryBadgeLabel,
} from "../model/crashRecoveryNotice";

/**
 * Workspace-header pill while crash recovery (#563) has a retry scheduled.
 * Renders nothing when no retry is pending so the header stays branch-free.
 */
export function CrashRecoveryHeaderBadge({
  recovery,
}: {
  recovery: CrashRecoveryRuntime | null | undefined;
}): ReactElement | null {
  if (recovery == null) return null;
  return <CrashRecoveryHeaderBadgeInner recovery={recovery} />;
}

function CrashRecoveryHeaderBadgeInner({
  recovery,
}: {
  recovery: CrashRecoveryRuntime;
}): ReactElement {
  const remaining = useCrashRecoveryCountdown(recovery.restartAt);

  return (
    <Tooltip withArrow label={crashRecoveryAttemptTooltip(recovery.attempt, recovery.maxAttempts)}>
      <Badge variant="light" color={CRASH_RECOVERY_NOTICE_COLOR} data-crash-recovery-badge>
        {crashRecoveryBadgeLabel(remaining)}
      </Badge>
    </Tooltip>
  );
}
