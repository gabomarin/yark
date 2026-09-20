import type { ReactElement } from "react";
import { Progress, Stack, Text } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import type { ServerStopProgress } from "@shared/types";

/** Stable `data-*` hook for stop progress (#457). Value must stay stable. */
const STOP_PROGRESS_ATTR = "data-stop-progress";
export const STOP_PROGRESS_SELECTOR = "[data-stop-progress]";

interface Props {
  progress: ServerStopProgress;
}

export function stopProgressForServer(
  progress: ServerStopProgress | null | undefined,
  serverId: string,
): ServerStopProgress | null {
  return progress?.active === true && progress.serverId === serverId
    ? progress
    : null;
}

export function StopProgressAlert({ progress }: Props): ReactElement {
  const label = progress.label.trim() || "Stopping this server safely";
  const title =
    progress.phase === "waiting"
      ? "Waiting for server"
      : progress.phase === "backing_up"
        ? "Backing up"
        : "Stopping server";
  return (
    <AppAlert color="blue" title={title} mb="sm" {...{ [STOP_PROGRESS_ATTR]: true }}>
      <Stack gap="xs">
        <Text size="sm">{label}</Text>
        <Progress
          value={progress.percent ?? 12}
          animated
          striped
          size="sm"
          radius="xl"
          aria-label={label}
        />
      </Stack>
    </AppAlert>
  );
}
