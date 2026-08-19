import type { ReactElement } from "react";
import { Pause, Play, ProhibitInset } from "@phosphor-icons/react";
import { ActionIcon, Group, Progress, Stack, Text, Tooltip } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
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

function filesJobActionIcon(
  kind: ServerCardFilesJobAction["kind"],
  iconSize: number,
): ReactElement {
  if (kind === "pause") return <Pause size={iconSize} weight="fill" />;
  if (kind === "resume") return <Play size={iconSize} weight="fill" />;
  return <ProhibitInset size={iconSize} />;
}

export function ServerCardProgress({
  shortProgressLabel,
  byteProgressLabel,
  byteProgressNoun,
  steamCmdProgressPercent,
  filesJobAction = null,
  onFilesJobAction,
}: Props): ReactElement {
  const density = useUiDensity();
  const compact = density === "compact";
  const actionSize = compact ? "xs" : "sm";
  const iconSize = compact ? 12 : 14;
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
                size={actionSize}
                color={filesJobAction.color}
                variant="light"
                aria-label={filesJobAction.label}
                data-files-job-action={filesJobAction.kind}
                onClick={onFilesJobAction}
              >
                {filesJobActionIcon(filesJobAction.kind, iconSize)}
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
