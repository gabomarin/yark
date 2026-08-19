import type { ReactElement } from "react";
import {
  ArrowsClockwise,
  Eye,
  HardDrives,
  Play,
  Stop,
  Wrench,
} from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { isInstallationReady } from "@shared/installation-health";
import { resolveDisplayedServerVersion } from "@shared/server-version-display";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import { RconStatusIcon } from "../RconStatusIcon/RconStatusIcon";
import { workspaceHeaderControls } from "./workspaceHeaderControls";
import classes from "./WorkspaceHeader.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  /** SteamCMD is rewriting this install — block start/restart like a live process. */
  filesJobActive?: boolean;
  filesJobReason?: string;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onToggleEnabled?: () => void;
  onOpenServerSwitcher?: () => void;
  onOpenServerActions?: () => void;
}

export function WorkspaceHeader(props: Props): ReactElement {
  const status = props.runtime?.status ?? "stopped";
  const version = resolveDisplayedServerVersion(props.installation) ?? "—";
  const isServerDisabled = !props.server.enabled;
  const filesReady = isInstallationReady(props.installation);
  const { canStart, canEnable, canStop, canRestart } = workspaceHeaderControls({
    status,
    enabled: props.server.enabled,
    filesJobActive: props.filesJobActive === true,
    filesReady,
    hasToggleEnabled: props.onToggleEnabled !== undefined,
  });
  const lockTitle = props.filesJobReason ?? "Wait for the file update to finish";
  const installBlockedTitle =
    props.installation?.guidance ?? "Install files first";

  return (
    <header className={classes.header}>
      <Group gap="sm" align="flex-start" wrap="nowrap" className={classes.identity}>
        <MapArtThumb
          mapId={props.server.map}
          mapModId={props.server.mapModId}
          modThumbnailUrl={
            props.server.mapModId
              ? props.server.modMetadataCache?.[props.server.mapModId]?.thumbnailUrl
              : null
          }
          size="lg"
        />
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text className={classes.crumb} fz="xs" c="dimmed">
            Servers / {props.server.name}
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Title order={3} fz="lg" lineClamp={1}>
              {props.server.name}
            </Title>
            <ServerRuntimeStatusBadge status={status} size="sm" />
            {status === "running" && <RconStatusIcon serverId={props.server.id} />}
            {!props.server.enabled && (
              <Badge size="sm" variant="light" color="gray">
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
          {isServerDisabled ? (
            <Button
              size="sm"
              leftSection={<Eye size={14} weight="fill" color="var(--mantine-color-blue-6)" />}
              onClick={() => props.onToggleEnabled?.()}
              disabled={!canEnable}
              title={
                props.filesJobActive === true ? lockTitle : undefined
              }
            >
              Enable
            </Button>
          ) : (
            <Button
              size="sm"
              variant="light"
              color="teal"
              leftSection={<Play size={14} weight="fill" />}
              onClick={props.onStart}
              disabled={!canStart}
              title={
                props.filesJobActive === true
                  ? lockTitle
                  : !filesReady
                    ? installBlockedTitle
                    : undefined
              }
            >
              Start
            </Button>
          )}
          <Button
            size="sm"
            variant="light"
            color="fossil"
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
            leftSection={<Stop size={14} weight="fill" />}
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
