import {
  CheckCircle,
  CloudArrowDown,
  Database,
  FolderOpen,
  HardDrive,
  ProhibitInset,
  TerminalWindow,
} from "@phosphor-icons/react";
import { Badge, Button, Card, Group, Progress, Stack, Text, Title } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { formatSteamCmdByteProgress, steamCmdByteProgressNoun } from "@shared/steamcmd-progress";
import type { SteamCmdConsoleSnapshot, SteamCmdStatus } from "@shared/types";
import { AutoScrollConsole } from "./AutoScrollConsole";
import classes from "./SteamCmdPage.module.css";

interface Props {
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdConsole: SteamCmdConsoleSnapshot | null;
  officialVersion: string | null;
  onInstallSteamCmd: () => void;
  onPickSteamCmdPath: () => void;
  onCancelSteamCmd: () => void;
}

const OPERATION_LABEL: Record<NonNullable<SteamCmdStatus["operation"]>, string> = {
  "install-steamcmd": "Installing SteamCMD",
  "install-files": "Installing files",
  update: "Updating server",
  "sync-files": "Copying files",
  "verify-files": "Verifying integrity",
};

export function SteamCmdPage(props: Props): JSX.Element {
  const detected = props.steamCmdStatus?.detected === true;
  const running = props.steamCmdStatus?.busy === true || props.steamCmdStatus?.running === true;
  const operation = props.steamCmdStatus?.operation ?? null;
  const percent = props.steamCmdStatus?.progressPercent ?? null;
  const progressBytes =
    props.steamCmdStatus?.progressBytesDownloaded != null
    && props.steamCmdStatus.progressBytesTotal != null
      ? formatSteamCmdByteProgress(
          props.steamCmdStatus.progressBytesDownloaded,
          props.steamCmdStatus.progressBytesTotal,
        )
      : null;
  const operationTitle = running
    ? operation !== null
      ? OPERATION_LABEL[operation]
      : "Operation in progress"
    : detected
      ? "SteamCMD ready"
      : "SteamCMD not configured";
  const operationDescription = running
    ? props.steamCmdStatus?.progressLabel
      ?? props.steamCmdStatus?.lastLine
      ?? "Preparing operation…"
    : detected
      ? "Available to install, update, and verify servers."
      : "Install it automatically or select an existing executable.";

  return (
    <PageScaffold
      title="SteamCMD"
      subtitle="Installation, executable path, and operations console"
      fillViewport
      actions={
        <Group gap="sm" wrap="wrap">
          {!detected && (
            <Button leftSection={<CloudArrowDown size={16} />} onClick={props.onInstallSteamCmd}>
              Install SteamCMD
            </Button>
          )}
          <Button variant="default" leftSection={<FolderOpen size={16} />} onClick={props.onPickSteamCmdPath}>
            Choose steamcmd.exe
          </Button>
          {running && (
            <Button color="red" variant="light" leftSection={<ProhibitInset size={16} />} onClick={props.onCancelSteamCmd}>
              Cancel operation
            </Button>
          )}
        </Group>
      }
    >
      <Stack gap="md" className={classes.steamContent} data-steamcmd-page>
        <Card
          withBorder
          className={classes.operationCard}
          data-tone={running ? "busy" : detected ? "ready" : "attention"}
        >
          <Stack gap="sm">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap="sm" wrap="nowrap" className={classes.operationIdentity}>
                <div className={classes.operationIcon}>
                  {detected ? <CheckCircle size={20} weight="fill" /> : <CloudArrowDown size={20} />}
                </div>
                <div className={classes.operationCopy}>
                  <Group gap="xs" wrap="wrap">
                    <Title order={3} size="h4">{operationTitle}</Title>
                    <Badge
                      size="sm"
                      variant="light"
                      color={running ? "blue" : detected ? "green" : "yellow"}
                    >
                      {running ? "In progress" : detected ? "Available" : "Needs setup"}
                    </Badge>
                  </Group>
                  <Text size="sm" c="dimmed" truncate>{operationDescription}</Text>
                </div>
              </Group>
              {running && (
                <div className={classes.progressValue}>
                  <Text fw={700}>{percent !== null ? `${percent.toFixed(0)}%` : "…"}</Text>
                  {props.steamCmdStatus?.queuedCount != null && props.steamCmdStatus.queuedCount > 0 && (
                    <Text size="xs" c="dimmed">{props.steamCmdStatus.queuedCount} queued</Text>
                  )}
                </div>
              )}
            </Group>
            {running && (
              <div className={classes.progressBlock}>
                <Group justify="space-between" gap="sm" wrap="nowrap">
                  <Text size="xs" c="dimmed" truncate>
                    {progressBytes !== null
                      ? `${steamCmdByteProgressNoun(operation)}: ${progressBytes}`
                      : operationDescription}
                  </Text>
                  {percent !== null && <Text size="xs" c="dimmed">{percent.toFixed(1)}%</Text>}
                </Group>
                <Progress
                  value={percent ?? 15}
                  animated={percent === null || percent < 100}
                  striped={percent === null || percent < 100}
                  size="sm"
                  radius="xl"
                  mt={6}
                />
              </div>
            )}
          </Stack>
        </Card>

        <div className={classes.contextStrip} aria-label="SteamCMD environment">
          <ContextItem
            icon={<CloudArrowDown size={16} />}
            label="Official version"
            value={props.officialVersion ?? "Not available"}
          />
          <ContextItem
            icon={<FolderOpen size={16} />}
            label="Executable"
            value={props.steamCmdStatus?.executablePath ?? "Not configured"}
          />
          <ContextItem
            icon={<Database size={16} />}
            label="Depotcache"
            value={props.steamCmdStatus?.depotCacheDir ?? "Not configured"}
          />
          <ContextItem
            icon={<HardDrive size={16} />}
            label="ASA content cache"
            value={props.steamCmdStatus?.contentCacheDir ?? "Not configured"}
          />
        </div>

        <Card withBorder className={classes.consoleCard}>
          <Stack gap="sm" className={classes.consoleStack}>
            <Group justify="space-between" gap="sm">
              <Group gap="xs">
                <TerminalWindow size={18} />
                <Title order={3} size="h4">SteamCMD console</Title>
              </Group>
              <Text size="xs" c="dimmed">Last 200 lines</Text>
            </Group>
            <AutoScrollConsole
              className={classes.console}
              lines={props.steamCmdConsole?.lines ?? []}
              maxLines={200}
              emptyText="No SteamCMD output yet."
            />
          </Stack>
        </Card>
      </Stack>
    </PageScaffold>
  );
}

interface ContextItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function ContextItem({ icon, label, value }: ContextItemProps): JSX.Element {
  return (
    <div className={classes.contextItem} title={value}>
      <Text className={classes.contextLabel}>{icon}{label}</Text>
      <Text size="xs" className={classes.contextValue}>{value}</Text>
    </div>
  );
}
