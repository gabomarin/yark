import type { ReactElement } from "react";
import { useState } from "react";
import { CaretDown, CaretUp, ProhibitInset, TerminalWindow } from "@phosphor-icons/react";
import { ActionIcon, Badge, Button, Divider, Group, Progress, Stack, Text, Title, Tooltip } from "@mantine/core";
import { formatSteamCmdByteProgress, steamCmdByteProgressNoun, hasMeaningfulSteamCmdByteProgress } from "@shared/steamcmd-progress";
import type { SteamCmdConsoleSnapshot, SteamCmdStatus } from "@shared/types";
import { ConsoleSurface } from "@ui/ConsoleSurface/ConsoleSurface";
import classes from "./SteamCmdProgressDock.module.css";

interface Props {
  status: SteamCmdStatus;
  console: SteamCmdConsoleSnapshot | null;
  serverName?: string | null;
  onCancel: () => void;
  onRetryJob: (jobId: string) => void;
  onDismissJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
}

const OPERATION_LABEL: Record<NonNullable<SteamCmdStatus["operation"]>, string> = {
  "install-steamcmd": "Installing SteamCMD",
  "install-files": "Installing files",
  update: "Updating server",
  "sync-files": "Copying files to the server",
  "verify-files": "Verifying integrity",
};

export function SteamCmdProgressDock(props: Props): ReactElement {
  const { status } = props;
  const [minimized, setMinimized] = useState(false);
  const title =
    status.operation !== null
      ? OPERATION_LABEL[status.operation]
      : "Critical jobs";
  const percent = status.progressPercent;
  /** Unknown % while busy (e.g. robocopy sync) — full striped bar with loop animation. */
  const indeterminate = percent === null && status.busy;
  const progressValue = indeterminate ? 100 : (percent ?? 0);
  const progressAnimated = indeterminate || (percent !== null && percent < 100);
  const lines = props.console?.lines ?? [];
  const downloaded = status.progressBytesDownloaded;
  const total = status.progressBytesTotal;
  const byteProgress =
    downloaded !== null && total !== null && hasMeaningfulSteamCmdByteProgress(downloaded, total)
      ? formatSteamCmdByteProgress(downloaded, total)
      : null;
  const byteNoun = steamCmdByteProgressNoun(status.operation);
  const stateLabel = (() => {
    const raw = status.progressLabel ?? status.lastLine ?? "In progress…";
    // Avoid duplicating "Verifying · X MB" + "Verified: X MB"
    if (byteProgress !== null && raw.includes(" · ")) {
      return raw.split(" · ")[0]!.trim();
    }
    return raw;
  })();
  const queueHint =
    status.queuedCount > 0
      ? ` · ${status.queuedCount} queued`
      : "";
  const jobs = status.criticalJobs ?? [];

  if (minimized) {
    return (
      <aside className={`${classes.dock} ${classes.dockMinimized}`} aria-live="polite">
        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <TerminalWindow size={16} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={600} truncate>
                {title}
                {queueHint}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {props.serverName != null && props.serverName.length > 0
                  ? `${props.serverName} · `
                  : ""}
                {byteProgress !== null ? `${byteNoun}: ${byteProgress}` : stateLabel}
                {percent !== null ? ` · ${percent.toFixed(0)}%` : ""}
              </Text>
            </div>
          </Group>
          <Group gap={6} wrap="nowrap">
            <Progress
              value={progressValue}
              animated={progressAnimated}
              striped={progressAnimated}
              size="sm"
              radius="xl"
              className={classes.miniProgress}
            />
            <Tooltip label="Expand">
              <ActionIcon
                size="sm"
                variant="default"
                aria-label="Expand download panel"
                onClick={() => setMinimized(false)}
              >
                <CaretUp size={14} />
              </ActionIcon>
            </Tooltip>
            {status.busy && (
              <Tooltip label="Cancel">
                <ActionIcon
                  size="sm"
                  color="red"
                  variant="subtle"
                  aria-label="Cancel operation"
                  onClick={props.onCancel}
                >
                  <ProhibitInset size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      </aside>
    );
  }

  return (
    <aside className={classes.dock} aria-live="polite">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Group gap="xs">
              <TerminalWindow size={18} />
              <Title order={5}>{title}</Title>
            </Group>
            {props.serverName != null && props.serverName.length > 0 && (
              <Text size="sm" c="dimmed">
                Server: {props.serverName}
              </Text>
            )}
            {status.queuedCount > 0 && (
              <Text size="xs" c="dimmed" mt={2}>
                {status.queuedCount} operation{status.queuedCount === 1 ? "" : "s"} queued
                (run one at a time)
              </Text>
            )}
            <Text size="sm" mt={4}>
              {stateLabel}
            </Text>
            {byteProgress !== null && (
              <Text size="sm" fw={600} mt={2}>
                {byteNoun}: {byteProgress}
              </Text>
            )}
          </div>
          <Group gap="xs">
            <Tooltip label="Minimize">
              <ActionIcon
                size="sm"
                variant="default"
                aria-label="Minimize download panel"
                onClick={() => setMinimized(true)}
              >
                <CaretDown size={14} />
              </ActionIcon>
            </Tooltip>
            {status.busy && (
              <Button
                size="xs"
                color="red"
                variant="filled"
                leftSection={<ProhibitInset size={14} />}
                onClick={props.onCancel}
              >
                Cancel
              </Button>
            )}
          </Group>
        </Group>

        {status.busy && (
          <Progress
            value={progressValue}
            animated={progressAnimated}
            striped={progressAnimated}
            size="md"
            radius="xl"
          />
        )}
        {percent !== null && (
          <Text size="xs" c="dimmed" ta="right">
            {percent.toFixed(1)}%
          </Text>
        )}

        <ConsoleSurface
          h={180}
          text={
            lines.length === 0
              ? "Waiting for progress…"
              : lines.slice(-60).join("\n")
          }
        />
        {jobs.length > 0 && (
          <Stack gap="xs">
            <Divider label="Durable job recovery" labelPosition="left" />
            {jobs.map((job) => (
              <Group
                key={job.id}
                data-critical-job-id={job.id}
                justify="space-between"
                align="flex-start"
                wrap="nowrap"
              >
                <div style={{ minWidth: 0 }}>
                  <Group gap="xs">
                    <Text size="sm" fw={600}>{job.operation}</Text>
                    <Badge
                      size="xs"
                      color={job.status === "failed" ? "red" : job.status === "blocked" ? "orange" : "blue"}
                    >
                      {job.status}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    Server: {job.serverName ?? job.serverId} · Phase: {job.phase} · attempts {job.attempts}/{job.maxAttempts}
                  </Text>
                  {(job.recoveryReason ?? job.lastError) !== null && (
                    <Text size="xs" c={job.status === "failed" ? "red" : "dimmed"}>
                      {job.recoveryReason ?? job.lastError}
                    </Text>
                  )}
                </div>
                <Group gap={4} wrap="nowrap">
                  {job.nextActions.includes("retry") && (
                    <Button size="compact-xs" variant="light" onClick={() => props.onRetryJob(job.id)}>
                      Retry
                    </Button>
                  )}
                  {job.nextActions.includes("cancel") && (
                    <Button size="compact-xs" color="red" variant="filled" onClick={() => props.onCancelJob(job.id)}>
                      Cancel
                    </Button>
                  )}
                  {job.nextActions.includes("dismiss") && (
                    <Button size="compact-xs" variant="subtle" onClick={() => props.onDismissJob(job.id)}>
                      Dismiss
                    </Button>
                  )}
                </Group>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </aside>
  );
}
