import { useState } from "react";
import { CaretDown, CaretUp, ProhibitInset, TerminalWindow } from "@phosphor-icons/react";
import { ActionIcon, Button, Group, Progress, Stack, Text, Title, Tooltip } from "@mantine/core";
import { formatSteamCmdByteProgress, steamCmdByteProgressNoun, hasMeaningfulSteamCmdByteProgress } from "@shared/steamcmd-progress";
import type { SteamCmdConsoleSnapshot, SteamCmdStatus } from "@shared/types";
import { AutoScrollConsole } from "./AutoScrollConsole";
import classes from "./SteamCmdProgressDock.module.css";

interface Props {
  status: SteamCmdStatus;
  console: SteamCmdConsoleSnapshot | null;
  serverName?: string | null;
  onCancel: () => void;
}

const OPERATION_LABEL: Record<NonNullable<SteamCmdStatus["operation"]>, string> = {
  "install-steamcmd": "Installing SteamCMD",
  "install-files": "Installing files",
  update: "Updating server",
  "sync-files": "Copying files to the server",
  "verify-files": "Verifying integrity",
};

export function SteamCmdProgressDock(props: Props): JSX.Element {
  const { status } = props;
  const [minimized, setMinimized] = useState(false);
  const title =
    status.operation !== null
      ? OPERATION_LABEL[status.operation]
      : "SteamCMD operation";
  const percent = status.progressPercent;
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
              value={percent ?? (status.busy ? 15 : 0)}
              animated={percent === null || percent < 100}
              striped={percent === null || percent < 100}
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
            <Tooltip label="Cancel">
              <ActionIcon
                size="sm"
                color="red"
                variant="light"
                aria-label="Cancel operation"
                onClick={props.onCancel}
              >
                <ProhibitInset size={14} />
              </ActionIcon>
            </Tooltip>
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
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<ProhibitInset size={14} />}
              onClick={props.onCancel}
            >
              Cancel
            </Button>
          </Group>
        </Group>

        <Progress
          value={percent ?? (status.busy ? 15 : 0)}
          animated={percent === null || percent < 100}
          striped={percent === null || percent < 100}
          size="md"
          radius="xl"
        />
        {percent !== null && (
          <Text size="xs" c="dimmed" ta="right">
            {percent.toFixed(1)}%
          </Text>
        )}

        <AutoScrollConsole
          className={classes.console}
          lines={lines}
          maxLines={60}
          emptyText="Waiting for SteamCMD output…"
        />
      </Stack>
    </aside>
  );
}
