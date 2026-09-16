import { WarningCircle } from "@phosphor-icons/react";
import { Text, UnstyledButton } from "@mantine/core";
import type { CrashRecoveryRuntime } from "@shared/types";
import type { ReactElement } from "react";
import { useCrashRecoveryCountdown } from "@features/crash-recovery/hooks/useCrashRecoveryCountdown";
import {
  CRASH_RECOVERY_NOTICE_COLOR,
  crashRecoveryWhenLabel,
} from "@features/crash-recovery/model/crashRecoveryNotice";
import classes from "./ServerCard.module.css";

/**
 * Card notice while crash recovery (#563) has a retry scheduled. Ticks locally
 * so the countdown stays live between status pushes/polls.
 */
export function CrashRecoveryNotice({
  recovery,
  onOpenLogs,
}: {
  recovery: CrashRecoveryRuntime;
  onOpenLogs?: () => void;
}): ReactElement {
  const remaining = useCrashRecoveryCountdown(recovery.restartAt);

  return (
    <UnstyledButton
      className={`${classes.runtimeError} ${classes.crashRecoveryNotice}`}
      onClick={onOpenLogs}
      aria-label="Crash detected; auto-restart scheduled – open runtime logs"
    >
      <WarningCircle
        size={18}
        weight="fill"
        className={classes.crashRecoveryIcon}
        aria-hidden
      />
      <Text c={CRASH_RECOVERY_NOTICE_COLOR} size="sm" className={classes.runtimeErrorText}>
        Crash detected – {crashRecoveryWhenLabel(remaining)} (attempt{" "}
        {recovery.attempt} of {recovery.maxAttempts})
      </Text>
    </UnstyledButton>
  );
}
