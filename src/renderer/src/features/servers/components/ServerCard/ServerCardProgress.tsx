import type { ReactElement } from "react";
import { Pause, Play, ProhibitInset } from "@phosphor-icons/react";
import { ActionIcon, Group, Progress, Stack, Text, Tooltip } from "@mantine/core";
import type { ServerCardFilesJobAction } from "./serverCardModel";
import classes from "./ServerCard.module.css";

interface Props {
  shortProgressLabel: string;
  byteProgressLabel: string | null;
  byteProgressNoun: string;
  steamCmdProgressPercent: number | null;
  filesJobAction?: ServerCardFilesJobAction | null;
  onFilesJobAction?: () => void;
}

function filesJobActionIcon(kind: ServerCardFilesJobAction["kind"]): ReactElement {
  if (kind === "pause") return <Pause size={14} weight="fill" />;
  if (kind === "resume") return <Play size={14} weight="fill" />;
  return <ProhibitInset size={14} />;
}

export function ServerCardProgress({
  shortProgressLabel,
  byteProgressLabel,
  byteProgressNoun,
  steamCmdProgressPercent,
  filesJobAction = null,
  onFilesJobAction,
}: Props): ReactElement {
  return (
    <Stack gap={6} className={classes.progressBlock}>
      <Group justify="space-between" gap="xs" align="flex-start" wrap="nowrap">
        <div>
          <Text size="sm">{shortProgressLabel}</Text>
          {byteProgressLabel !== null && (
            <Text size="xs" c="dimmed" mt={2}>
              {byteProgressNoun}: {byteProgressLabel}
            </Text>
          )}
        </div>
        <Group gap={8} wrap="nowrap" align="center">
          {steamCmdProgressPercent !== null && (
            <Text size="sm" c="dimmed">
              {steamCmdProgressPercent.toFixed(0)}%
            </Text>
          )}
          {filesJobAction !== null && (
            <Tooltip label={filesJobAction.label} withArrow>
              <ActionIcon
                size="sm"
                color={filesJobAction.color}
                variant="light"
                aria-label={filesJobAction.label}
                data-files-job-action={filesJobAction.kind}
                onClick={onFilesJobAction}
              >
                {filesJobActionIcon(filesJobAction.kind)}
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
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
