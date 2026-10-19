import type { ReactElement } from "react";
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
}

function ProgressLabel({
  shortProgressLabel,
  onOpenDownloads,
  waiting,
}: {
  shortProgressLabel: string;
  onOpenDownloads?: () => void;
  /** Queued or paused: no bar, so the label itself has to carry the job. */
  waiting?: boolean;
}): ReactElement {
  if (onOpenDownloads === undefined) {
    return (
      <Text
        size="sm"
        className={waiting ? classes.progressWaitingLabel : undefined}
        data-progress-waiting={waiting || undefined}
      >
        {shortProgressLabel}
      </Text>
    );
  }

  return (
    <UnstyledButton
      className={waiting ? `${classes.progressCta} ${classes.progressWaiting}` : classes.progressCta}
      aria-label={`${shortProgressLabel} – open Downloads`}
      data-progress-waiting={waiting || undefined}
      onClick={onOpenDownloads}
    >
      <Text
        span
        size="sm"
        fw={waiting ? 600 : 500}
        c={waiting ? undefined : "var(--mantine-color-blue-light-color)"}
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
}: Props): ReactElement {
  const label = (
    <ProgressLabel
      shortProgressLabel={shortProgressLabel}
      onOpenDownloads={onOpenDownloads}
      waiting={!showProgressBar}
    />
  );
  const showByteLine =
    byteProgressLabel !== null && !byteProgressLineIsRedundant(shortProgressLabel, byteProgressLabel);

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
      <Group gap="xs" wrap="nowrap" align="center" w="100%">
        <Progress
          value={steamCmdProgressPercent ?? 12}
          animated={steamCmdProgressPercent === null}
          striped={steamCmdProgressPercent === null}
          size="sm"
          radius="xl"
          style={{ flex: 1, minWidth: 0 }}
        />
      </Group>
    </Stack>
  );
}
