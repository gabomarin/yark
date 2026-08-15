import type { ReactElement } from "react";
import { Button, Group, Loader, Progress, Stack, Text } from "@mantine/core";
import type { CloneInstallProgress } from "@shared/types";

interface Props {
  progress: CloneInstallProgress | null;
  onCancel: () => void;
  cancelling: boolean;
}

export function CloneCopyProgress(props: Props): ReactElement {
  const percent = props.progress?.percent ?? 12;
  return (
    <Stack gap="sm">
      <Group gap="sm" wrap="nowrap" align="center">
        <Loader size="sm" aria-label="Folder copy in progress" />
        <Text size="sm" style={{ flex: 1 }}>
          {props.progress?.label || "Copying server folder…"}
        </Text>
      </Group>
      <Progress value={percent} animated striped />
      {props.progress?.destinationDir != null && (
        <Text size="xs" c="dimmed">
          New folder: {props.progress.destinationDir}
        </Text>
      )}
      <Group justify="flex-end">
        <Button
          variant="default"
          onClick={props.onCancel}
          loading={props.cancelling}
        >
          Cancel copy
        </Button>
      </Group>
    </Stack>
  );
}
