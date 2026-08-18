import type { ReactElement } from "react";
import {
  ArrowSquareOut,
  ArrowCounterClockwise,
  Pause,
  Play,
  ProhibitInset,
  X,
} from "@phosphor-icons/react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { ServerCardProgress } from "@features/servers/components/ServerCard/ServerCardProgress";
import { ConsoleSurface } from "@ui/ConsoleSurface/ConsoleSurface";
import { downloadRowMeta } from "./downloadsCopy";
import type { DownloadRow } from "./downloadsModel";
import classes from "./DownloadsPage.module.css";

interface Props {
  selected: DownloadRow | null;
  liveRow: DownloadRow | null;
  consoleBody: string;
  onOpenLogs: (row: DownloadRow) => void;
  onCancelLive: () => void;
  onPauseLive: () => void;
  onCancelRow: (row: DownloadRow) => void;
  onRetryJob: (jobId: string) => void;
  onResumeJob: (jobId: string) => void;
  onDismissJob: (jobId: string) => void;
  steamCmdMissing?: boolean;
}

export function DownloadsDetailPanel(props: Props): ReactElement {
  const { selected, liveRow } = props;
  if (selected === null) {
    return (
      <section className={classes.detailSection} aria-label="Download details">
        <Text size="sm" c="dimmed">
          Select a download to see details and the SteamCMD console.
        </Text>
      </section>
    );
  }

  const job = selected.job;
  const selectedIsLive =
    selected.kind === "active"
    || (liveRow !== null && liveRow.id === selected.id);
  const showSteamCmdBar =
    selectedIsLive && liveRow !== null && liveRow.usesLiveCancel;
  const logsTarget = selected;
  const canRetry = job?.nextActions.includes("retry") === true;
  const canDismiss = job?.nextActions.includes("dismiss") === true;
  const canResume = job?.nextActions.includes("resume") === true;
  const showCancelThisJob =
    job?.nextActions.includes("cancel") === true
    && !showSteamCmdBar
    && selected.kind !== "queued";
  const showJobActions = canResume || canRetry || showCancelThisJob || canDismiss;

  return (
    <section className={classes.detailSection} aria-label="Download details">
      <Stack gap="xs">
        <div style={{ minWidth: 0 }}>
          <Text fw={600} truncate>
            {selected.title}
          </Text>
          <Text size="sm" c="dimmed" truncate>
            {downloadRowMeta(selected)}
          </Text>
        </div>
        {job !== null && showJobActions && (
          <Group gap={6} wrap="wrap" aria-label="This job">
            {canResume && (
              <Button
                size="compact-sm"
                color="teal"
                variant="light"
                leftSection={<Play size={14} weight="fill" />}
                onClick={() => props.onResumeJob(job.id)}
              >
                Resume this job
              </Button>
            )}
            {canRetry && (
              <Button
                size="compact-sm"
                color="teal"
                variant="light"
                leftSection={<ArrowCounterClockwise size={14} />}
                onClick={() => props.onRetryJob(job.id)}
              >
                Retry
              </Button>
            )}
            {showCancelThisJob && (
              <Button
                size="compact-sm"
                color="red"
                variant="light"
                leftSection={<ProhibitInset size={14} />}
                onClick={() => props.onCancelRow(selected)}
              >
                Cancel this job
              </Button>
            )}
            {canDismiss && (
              <Button
                size="compact-sm"
                variant="subtle"
                leftSection={<X size={14} />}
                onClick={() => props.onDismissJob(job.id)}
              >
                Dismiss
              </Button>
            )}
          </Group>
        )}
      </Stack>

      {(job?.recoveryReason ?? job?.lastError) !== null
        && (job?.recoveryReason ?? job?.lastError) !== undefined && (
        <Text size="sm" c={job?.status === "failed" ? "red" : "dimmed"}>
          {job?.recoveryReason ?? job?.lastError}
        </Text>
      )}

      {selected.percent !== null && (
        <ServerCardProgress
          shortProgressLabel={selected.phase}
          byteProgressLabel={selected.byteProgress}
          byteProgressNoun={selected.byteProgressNoun ?? "Files"}
          steamCmdProgressPercent={selected.percent}
        />
      )}

      {showSteamCmdBar && liveRow !== null && (
        <div className={classes.steamCmdBar} role="group" aria-label="SteamCMD process">
          <div className={classes.steamCmdBarCopy}>
            <Text fw={600} size="sm">
              SteamCMD process
            </Text>
            <Text size="xs" c="dimmed">
              {liveRow.percent !== null
                ? `Pauses or cancels the active download on this PC (${liveRow.serverName} · ${liveRow.percent.toFixed(0)}%).`
                : `Pauses or cancels the active download on this PC (${liveRow.serverName}).`}
            </Text>
          </div>
          <Group gap={6} wrap="nowrap">
            {liveRow.canPause ? (
              <Button
                size="compact-sm"
                color="yellow"
                variant="light"
                leftSection={<Pause size={14} weight="fill" />}
                onClick={() => props.onPauseLive()}
              >
                Pause SteamCMD
              </Button>
            ) : (
              <Button
                size="compact-sm"
                color="red"
                variant="light"
                leftSection={<ProhibitInset size={14} />}
                onClick={() => props.onCancelLive()}
              >
                Cancel SteamCMD
              </Button>
            )}
          </Group>
        </div>
      )}

      {selectedIsLive && <ConsoleSurface fill text={props.consoleBody} />}

      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed">
          {selected.kind === "queued"
            ? liveRow !== null
              ? `This job starts after SteamCMD finishes ${liveRow.serverName}.`
              : "This job is waiting. It starts when nothing else is using SteamCMD."
            : selected.kind === "paused"
              ? props.steamCmdMissing === true
                ? "Install SteamCMD in Settings before you can resume."
                : "SteamCMD is paused. Resume this job to continue."
              : selected.kind === "attention"
                ? canRetry
                  ? "This job stopped. Retry to run it again, or Dismiss to clear it."
                  : canDismiss
                    ? "This leftover cannot be retried from here. Dismiss it, then start the job again."
                    : "This job stopped."
                : "Live console for the active SteamCMD job."}
        </Text>
        <Button
          size="compact-sm"
          variant="subtle"
          leftSection={<ArrowSquareOut size={14} />}
          onClick={() => props.onOpenLogs(logsTarget)}
          disabled={logsTarget.serverId === null}
        >
          Open in Logs
        </Button>
      </Group>
    </section>
  );
}
