import type { ReactElement } from "react";
import {
  ArrowLeft,
  ArrowsClockwise,
  HardDrives,
  Play,
  Power,
  Wrench,
} from "@phosphor-icons/react";
import { ActionIcon, Badge, Button, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { resolveDisplayedServerVersion } from "@shared/server-version-display";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import classes from "./WorkspaceHeader.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  /** SteamCMD is rewriting this install — block start/restart like a live process. */
  filesJobActive?: boolean;
  filesJobReason?: string;
  onBack: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpenServerSwitcher?: () => void;
  onOpenServerActions?: () => void;
}

export function WorkspaceHeader(props: Props): ReactElement {
  const status = props.runtime?.status ?? "stopped";
  const version = resolveDisplayedServerVersion(props.installation) ?? "—";
  const canStart =
    props.server.enabled !== false
    && (status === "stopped" || status === "error")
    && props.filesJobActive !== true;
  const canStop = status === "running" || status === "starting";
  const canRestart =
    props.server.enabled !== false && status === "running" && props.filesJobActive !== true;
  const lockTitle = props.server.enabled === false
    ? "Enable the profile before starting it"
    : (props.filesJobReason ?? "Wait for the file update to finish");

  return (
    <header className={classes.header}>
      <Group gap="sm" align="flex-start" wrap="nowrap" className={classes.identity}>
        <Tooltip label="Back to servers">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            aria-label="Back to servers"
            onClick={props.onBack}
          >
            <ArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text className={classes.crumb} fz="xs" c="dimmed">
            Servers / {props.server.name}
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Title order={3} fz="lg" lineClamp={1}>
              {props.server.name}
            </Title>
            <ServerRuntimeStatusBadge status={status} size="sm" />
            {props.server.enabled === false && (
              <Badge size="sm" color="gray" variant="light">
                Inactive
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {props.server.map} · port {props.server.gamePort} · version {version}
          </Text>
        </Stack>
      </Group>

      <Stack gap={7} align="flex-end" className={classes.controls}>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="sm"
            leftSection={<Play size={14} weight="fill" />}
            onClick={props.onStart}
            disabled={!canStart}
            title={props.filesJobActive === true ? lockTitle : undefined}
          >
            Start
          </Button>
          <Button
            size="sm"
            variant="light"
            leftSection={<ArrowsClockwise size={14} />}
            onClick={props.onRestart}
            disabled={!canRestart}
            title={props.filesJobActive === true ? lockTitle : undefined}
          >
            Restart
          </Button>
          <Button
            size="sm"
            color="red"
            variant="light"
            leftSection={<Power size={14} />}
            onClick={props.onStop}
            disabled={!canStop}
          >
            Stop
          </Button>
        </Group>

        {props.onOpenServerSwitcher !== undefined &&
          props.onOpenServerActions !== undefined && (
            <Group gap={6} wrap="nowrap" className={classes.compactTools}>
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<HardDrives size={14} />}
                onClick={props.onOpenServerSwitcher}
              >
                Switch server
              </Button>
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<Wrench size={14} />}
                onClick={props.onOpenServerActions}
              >
                Status and actions
              </Button>
            </Group>
          )}
      </Stack>
    </header>
  );
}
