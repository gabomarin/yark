import type { ReactElement, ReactNode } from "react";
import { Group, Progress, Stack, Text, UnstyledButton } from "@mantine/core";
import { byteProgressLineIsRedundant } from "@shared/byte-progress-display";
import classes from "./ServerCard.module.css";

interface Props {
  shortProgressLabel: string;
  byteProgressLabel: string | null;
  byteProgressNoun: string;
  steamCmdProgressPercent: number | null;
  showProgressBar?: boolean;
  onOpenDownloads?: () => void;
  /** Live SteamCMD Pause/Cancel — rendered beside the progress track (Downloads detail). */
  processAction?: ReactNode;
}

function ProgressLabel({
  shortProgressLabel,
  onOpenDownloads,
}: {
  shortProgressLabel: string;
  onOpenDownloads?: () => void;
}): ReactElement {
  if (onOpenDownloads === undefined) {
    return <Text size="sm">{shortProgressLabel}</Text>;
  }

  return (
    <UnstyledButton
      className={classes.progressCta}
      aria-label={`${shortProgressLabel} — open Downloads`}
      onClick={onOpenDownloads}
    >
      <Text
        span
        size="sm"
        fw={500}
        c="var(--mantine-color-blue-light-color)"
        className={classes.progressCtaLabel}
      >
        {shortProgressLabel}
      </Text>
    </UnstyledButton>
  );
}

export function ServerCardProgress({
  shortProgressLabel,
  byteProgressLabel,
  byteProgressNoun,
  steamCmdProgressPercent,
  showProgressBar = true,
  onOpenDownloads,
  processAction,
}: Props): ReactElement {
  const label = (
    <ProgressLabel shortProgressLabel={shortProgressLabel} onOpenDownloads={onOpenDownloads} />
  );
  const showByteLine =
    byteProgressLabel !== null
    && !byteProgressLineIsRedundant(shortProgressLabel, byteProgressLabel);

  if (!showProgressBar) {
    return (
      <div className={classes.progressHint} data-progress-hint>
        {label}
        {showByteLine && (
          <Text size="xs" c="dimmed" mt={2} component="span" display="block">
            {byteProgressNoun}: {byteProgressLabel}
          </Text>
        )}
      </div>
    );
  }

  return (
    <Stack gap={6} className={classes.progressBlock}>
      <Group justify="space-between" gap="xs" align="flex-start" wrap="nowrap">
        <div>
          {label}
          {showByteLine && (
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
      <Group
        gap="xs"
        wrap="nowrap"
        align="center"
        w="100%"
        {...(processAction !== undefined ? { "data-download-live-action": true } : {})}
      >
        <Progress
          value={steamCmdProgressPercent ?? 12}
          animated={steamCmdProgressPercent === null}
          striped={steamCmdProgressPercent === null}
          size="sm"
          radius="xl"
          style={{ flex: 1, minWidth: 0 }}
        />
        {processAction}
      </Group>
    </Stack>
  );
}
