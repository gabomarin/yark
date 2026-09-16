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
 * Complements the card notice without pushing the header layout around.
 */
export function CrashRecoveryHeaderBadge({
  recovery,
}: {
  recovery: CrashRecoveryRuntime;
}): ReactElement {
  const remaining = useCrashRecoveryCountdown(recovery.restartAt);

  return (
    <Tooltip
      withArrow
      label={crashRecoveryAttemptTooltip(recovery.attempt, recovery.maxAttempts)}
    >
      <Badge
        size="sm"
        variant="light"
        color={CRASH_RECOVERY_NOTICE_COLOR}
        data-crash-recovery-badge
      >
        {crashRecoveryBadgeLabel(remaining)}
      </Badge>
    </Tooltip>
  );
}
