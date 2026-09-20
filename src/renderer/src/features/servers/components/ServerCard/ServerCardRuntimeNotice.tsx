import { Text, UnstyledButton } from "@mantine/core";
import type { ServerRuntimeInfo } from "@shared/types";
import type { ReactElement } from "react";
import { CrashRecoveryNotice } from "./CrashRecoveryNotice";
import classes from "./ServerCard.module.css";

/**
 * Runtime notice row under the card body: the crash-recovery countdown when a
 * retry is pending, otherwise the last error / operator-closed notice (#563, #524).
 */
export function ServerCardRuntimeNotice({
  runtime,
  onReviewError,
}: {
  runtime: ServerRuntimeInfo | null;
  onReviewError?: () => void;
}): ReactElement | null {
  const recovery = runtime?.crashRecovery ?? null;
  if (recovery !== null) {
    return <CrashRecoveryNotice recovery={recovery} onOpenLogs={onReviewError} />;
  }

  const lastError = runtime?.lastError ?? null;
  if (lastError === null) return null;
  const stopped = runtime?.status === "stopped";

  return (
    <UnstyledButton
      className={classes.runtimeError}
      onClick={onReviewError}
      aria-label={
        stopped ? "Review notice – open runtime logs" : "Review error – open runtime logs"
      }
    >
      <Text c={stopped ? "attention" : "red"} size="sm" className={classes.runtimeErrorText}>
        {lastError}
      </Text>
    </UnstyledButton>
  );
}
