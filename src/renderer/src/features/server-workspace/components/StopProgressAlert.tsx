import type { ReactElement } from "react";
import { Alert, Progress, Stack, Text } from "@mantine/core";
import type { ServerStopProgress } from "@shared/types";

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
    <Alert color="blue" title={title} mb="sm" data-stop-progress>
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
    </Alert>
  );
}
