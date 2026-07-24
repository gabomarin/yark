import { ArrowLeft, Play, Power, ArrowsClockwise } from "@phosphor-icons/react";
import { Badge, Button, Group, Stack, Text, Title } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import classes from "./WorkspaceHeader.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  onBack: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  stopped: "Offline",
  starting: "Starting",
  running: "Online",
  stopping: "Stopping",
  error: "Error",
};

export function WorkspaceHeader(props: Props): JSX.Element {
  const status = props.runtime?.status ?? "stopped";
  const version =
    props.installation?.arkVersion ??
    props.installation?.build ??
    props.installation?.version ??
    "—";
  const canStart = status === "stopped" || status === "error";
  const canStop = status === "running" || status === "starting";
  const canRestart = status === "running";

  return (
    <header className={classes.header}>
      <Group gap="md" align="flex-start" wrap="nowrap" className={classes.identity}>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<ArrowLeft size={16} />}
          onClick={props.onBack}
        >
          Overview
        </Button>
        <Stack gap={2}>
          <Group gap="sm">
            <Title order={2}>{props.server.name}</Title>
            <Badge
              color={
                status === "running"
                  ? "green"
                  : status === "error"
                    ? "red"
                    : status === "starting" || status === "stopping"
                      ? "blue"
                      : "gray"
              }
              variant="light"
            >
              {STATUS_LABEL[status] ?? status}
            </Badge>
          </Group>
          <Text c="dimmed" size="sm">
            {props.server.map} · puerto {props.server.gamePort} · versión {version}
          </Text>
        </Stack>
      </Group>

      <Group gap="xs">
        <Button
          leftSection={<Play size={16} weight="fill" />}
          onClick={props.onStart}
          disabled={!canStart}
        >
          Start
        </Button>
        <Button
          variant="light"
          leftSection={<ArrowsClockwise size={16} />}
          onClick={props.onRestart}
          disabled={!canRestart}
        >
          Restart
        </Button>
        <Button
          color="red"
          variant="light"
          leftSection={<Power size={16} />}
          onClick={props.onStop}
          disabled={!canStop}
        >
          Stop
        </Button>
      </Group>
    </header>
  );
}
