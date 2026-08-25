import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  CloudArrowDown,
  CopySimple,
  Eye,
  EyeSlash,
  FloppyDisk,
  FolderOpen,
  Power,
  ShieldCheck,
  Wrench,
} from "@phosphor-icons/react";
import { Button, Stack, Text } from "@mantine/core";
import type { ProcessMetricsUpdatedPush } from "@shared/ipc";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import {
  installationHealthLabel,
  isInstallOfferHealth,
  isInstallationReady,
} from "@shared/installation-health";
import { formatServerUptime } from "@shared/server-uptime";
import { resolveDisplayedServerVersion } from "@shared/server-version-display";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import {
  formatCpuPercent,
  formatWorkingSet,
} from "@features/servers/model/serverCardProcessMeta";
import { formatServerSurvivorMeta } from "@features/servers/model/serverCardSurvivorMeta";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { MetaRow } from "@ui/MetaRow/MetaRow";
import { serverRuntimeStatusLabel } from "@ui/ServerRuntimeStatusBadge/serverRuntimeStatus";
import {
  canEnqueueFilesJobFromMenu,
  filesQueueKindToStatus,
  isFilesJobOperation,
} from "@shared/files-job-priority";
import classes from "./SidePanel.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  playerList?: PlayerListState | null;
  processMetrics?: ProcessMetricsUpdatedPush | null;
  /** SteamCMD files job in progress – blocks install/update/verify unless a stronger job can replace a queued one. */
  opsLocked?: boolean;
  opsLockReason?: string;
  filesJobOperation?: "install-files" | "update" | "verify-files" | null;
  filesJobQueueKind?: "active" | "paused" | "queued" | null;
  onOpenFolder: () => void;
  onInstallFiles: () => void;
  onUpdateNow: () => void;
  onVerifyFiles: () => void;
  onSaveWorld: () => void;
  onCopyConfiguration: () => void;
  onKill: () => void;
  onToggleEnabled?: () => void;
}

export function SidePanel(props: Props): ReactElement {
  const status = props.runtime?.status ?? "stopped";
  const isActive = status === "starting" || status === "running" || status === "stopping";
  const steamCmdBusy = props.opsLocked === true;
  const filesOccupant =
    isFilesJobOperation(props.filesJobOperation)
    && props.filesJobQueueKind != null
      ? {
          id: "workspace",
          operation: props.filesJobOperation,
          status: filesQueueKindToStatus(props.filesJobQueueKind),
        }
      : null;
  const lockAllFileOps = steamCmdBusy && filesOccupant === null;
  const installLocked =
    isActive
    || lockAllFileOps
    || !canEnqueueFilesJobFromMenu("install-files", filesOccupant);
  const updateLocked =
    isActive
    || lockAllFileOps
    || !canEnqueueFilesJobFromMenu("update", filesOccupant);
  const verifyLocked =
    lockAllFileOps || !canEnqueueFilesJobFromMenu("verify-files", filesOccupant);
  const steamCmdLockTitle = props.opsLockReason;
  const installLockTitle = installLocked
    ? steamCmdLockTitle ?? (isActive ? "Stop the server before installing files" : undefined)
    : isActive
      ? "Stop the server before installing files"
      : undefined;
  const updateLockTitle = updateLocked
    ? steamCmdLockTitle ?? (isActive ? "Stop the server before updating files" : undefined)
    : isActive
      ? "Stop the server before updating files"
      : undefined;
  const verifyLockTitle = verifyLocked
    ? steamCmdLockTitle ?? undefined
    : isActive
      ? "The server will stop for this check, then restart if it succeeds"
      : undefined;
  const filesReady = isInstallationReady(props.installation);
  const canOfferInstall = isInstallOfferHealth(props.installation?.health);
  const toggleDisabled =
    props.onToggleEnabled === undefined ||
    steamCmdBusy ||
    (props.server.enabled && isActive);
  const toggleTitle =
    props.onToggleEnabled === undefined
      ? undefined
      : steamCmdBusy
        ? steamCmdLockTitle ?? "Another server operation is in progress"
        : props.server.enabled && isActive
          ? "Stop the server first"
          : undefined;
  const installHiddenTitle =
    !canOfferInstall && !filesReady
      ? props.installation?.guidance ??
        "Install is unavailable until the install path looks safe to use."
      : undefined;
  const version = resolveDisplayedServerVersion(props.installation) ?? "–";
  const installHealthLabel = props.installation
    ? installationHealthLabel(props.installation.health)
    : "Checking…";
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (status !== "running" || props.runtime?.startedAt == null) {
      return;
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [status, props.runtime?.startedAt]);
  const uptime =
    status === "running"
      ? formatServerUptime(props.runtime?.startedAt, nowMs)
      : "–";
  const survivors = formatServerSurvivorMeta({
    status,
    survivorList: props.playerList ?? null,
    maxPlayers: props.server.maxPlayers,
  });
  const processLive = status === "running" || status === "starting";
  const metrics = props.processMetrics;
  const ram =
    processLive && metrics != null && metrics.error == null
      ? formatWorkingSet(metrics.workingSetBytes)
      : "–";
  const cpu =
    processLive && metrics != null && metrics.error == null
      ? formatCpuPercent(metrics.cpuPercent)
      : "–";

  return (
    <aside className={classes.panel}>
      <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.card}>
        <Stack gap={6}>
          <Text className={classes.widgetTitle}>Status</Text>
          <MetaRow label="Status" value={serverRuntimeStatusLabel(status)} />
          <MetaRow label="Uptime" value={uptime} />
          <MetaRow label="Survivors" value={survivors} />
          <MetaRow label="RAM" value={ram} />
          <MetaRow label="CPU" value={cpu} />
          <MetaRow label="Install" value={installHealthLabel} />
          <MetaRow label="Version" value={version} />
          <MetaRow label="Cluster" value={props.server.clusterId ?? "No cluster"} />
        </Stack>
      </AppSurfaceCard>

      <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.card}>
        <Stack gap={6}>
          <Text className={classes.widgetTitle}>Quick actions</Text>
          <Button
            size="sm"
            variant="default"
            fullWidth
            justify="flex-start"
            leftSection={
              props.server.enabled ? (
                <EyeSlash size={14} color="var(--mantine-color-red-6)" />
              ) : (
                <Eye size={14} weight="fill" color="var(--mantine-color-blue-6)" />
              )
            }
            onClick={props.onToggleEnabled}
            disabled={toggleDisabled}
            title={toggleTitle}
          >
            {props.server.enabled ? "Disable server" : "Enable server"}
          </Button>
          <Button
            size="sm"
            variant="default"
            fullWidth
            justify="flex-start"
            leftSection={<FolderOpen size={14} color="var(--mantine-color-blue-6)" />}
            onClick={props.onOpenFolder}
          >
            Open folder
          </Button>
          {canOfferInstall ? (
            <Button
              size="sm"
              variant="default"
              fullWidth
              justify="flex-start"
              leftSection={<Wrench size={14} color="var(--mantine-color-blue-6)" />}
              onClick={props.onInstallFiles}
              disabled={installLocked}
              title={installLockTitle}
            >
              Install files
            </Button>
          ) : installHiddenTitle !== undefined ? (
            <Button
              size="sm"
              variant="default"
              fullWidth
              justify="flex-start"
              leftSection={<Wrench size={14} color="var(--mantine-color-gray-6)" />}
              disabled
              title={installHiddenTitle}
            >
              Install files
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="default"
            fullWidth
            justify="flex-start"
            leftSection={<ShieldCheck size={14} color="var(--mantine-color-teal-6)" />}
            onClick={props.onVerifyFiles}
            disabled={verifyLocked}
            title={verifyLockTitle}
          >
            Verify integrity
          </Button>
          <Button
            size="sm"
            variant="default"
            fullWidth
            justify="flex-start"
            leftSection={<CloudArrowDown size={14} color="var(--mantine-color-attention-6)" />}
            onClick={props.onUpdateNow}
            disabled={updateLocked}
            title={updateLockTitle}
          >
            Force update
          </Button>
          <Button
            size="sm"
            variant="default"
            fullWidth
            justify="flex-start"
            leftSection={<FloppyDisk size={14} color="var(--mantine-color-teal-6)" />}
            onClick={props.onSaveWorld}
            disabled={status !== "running"}
          >
            Save world
          </Button>
          <Button
            size="sm"
            variant="default"
            fullWidth
            justify="flex-start"
            leftSection={<CopySimple size={14} color="var(--mantine-color-blue-6)" />}
            onClick={props.onCopyConfiguration}
          >
            Copy configuration
          </Button>
          <Button
            size="sm"
            color="red"
            variant="filled"
            fullWidth
            justify="flex-start"
            leftSection={<Power size={14} />}
            onClick={props.onKill}
            disabled={status === "stopped" || steamCmdBusy}
            title={steamCmdBusy ? steamCmdLockTitle : undefined}
          >
            Force close
          </Button>
        </Stack>
      </AppSurfaceCard>
    </aside>
  );
}
