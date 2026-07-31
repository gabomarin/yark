import type { ReactElement } from "react";
import { Group, Progress, Stack, Text } from "@mantine/core";
import classes from "./ServerCard.module.css";

interface Props {
  shortProgressLabel: string;
  byteProgressLabel: string | null;
  byteProgressNoun: string;
  steamCmdProgressPercent: number | null;
}

export function ServerCardProgress({
  shortProgressLabel,
  byteProgressLabel,
  byteProgressNoun,
  steamCmdProgressPercent,
}: Props): ReactElement {
  return (
    <Stack gap={6} className={classes.progressBlock}>
      <Group justify="space-between" gap="xs" align="flex-start">
        <div>
          <Text size="sm">{shortProgressLabel}</Text>
          {byteProgressLabel !== null && (
            <Text size="xs" c="dimmed" mt={2}>
              {byteProgressNoun}: {byteProgressLabel}
            </Text>
          )}
        </div>
        {steamCmdProgressPercent !== null && (
          <Text size="sm" c="dimmed">
            {steamCmdProgressPercent.toFixed(0)}%
          </Text>
        )}
      </Group>
      <Progress
        value={steamCmdProgressPercent ?? 12}
        animated
        striped
        size="sm"
        radius="xl"
      />
    </Stack>
  );
}
