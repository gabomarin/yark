import type { ReactElement } from "react";
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
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import {
  formatInstallationCheckedAt,
  installationHealthLabel,
  isInstallOfferHealth,
  isInstallationReady,
} from "@shared/installation-health";
import { resolveDisplayedServerVersion } from "@shared/server-version-display";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { serverRuntimeStatusLabel } from "@ui/ServerRuntimeStatusBadge/serverRuntimeStatus";
import classes from "./SidePanel.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  /** SteamCMD files job in progress — blocks install/update/verify. */
  opsLocked?: boolean;
  opsLockReason?: string;
  onOpenFolder: () => void;
  onInstallFiles: () => void;
  onUpdateNow: () => void;
  onVerifyFiles: () => void;
  onSaveWorld: () => void;
  onCopyConfiguration: () => void;
  onKill: () => void;
  onToggleEnabled?: () => void;
}

function MetaRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className={classes.metaRow}>
      <Text className={classes.metaLabel}>{label}</Text>
      <Text className={classes.metaValue}>{value}</Text>
    </div>
  );
}

export function SidePanel(props: Props): ReactElement {
  const status = props.runtime?.status ?? "stopped";
  const isActive = status === "starting" || status === "running" || status === "stopping";
  const steamCmdBusy = props.opsLocked === true;
  const installLocked = steamCmdBusy || isActive;
  const updateVerifyLocked = steamCmdBusy;
  const steamCmdLockTitle = props.opsLockReason;
  const installLockTitle =
    steamCmdLockTitle ??
    (isActive ? "Stop the server before installing files" : undefined);
  const updateVerifyTitle =
    steamCmdLockTitle ??
    (isActive
      ? "The server will stop for this check, then restart if it succeeds"
      : undefined);
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
  const version = resolveDisplayedServerVersion(props.installation) ?? "—";
  const installHealthLabel = props.installation
    ? installationHealthLabel(props.installation.health)
    : "Checking…";
  const checkedAtLabel = formatInstallationCheckedAt(props.installation?.checkedAt);
  const uptime =
    props.runtime?.startedAt != null && status === "running"
      ? new Date(props.runtime.startedAt).toLocaleString()
      : "—";

  return (
    <aside className={classes.panel}>
      <AppSurfaceCard tone="flat" padding="sm" radius="md" className={classes.card}>
        <Stack gap={6}>
          <Text className={classes.widgetTitle}>Status</Text>
          <MetaRow label="Status" value={serverRuntimeStatusLabel(status)} />
          <MetaRow label="Started" value={uptime} />
          <MetaRow label="Install" value={installHealthLabel} />
          <MetaRow label="Checked" value={checkedAtLabel} />
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
            disabled={updateVerifyLocked}
            title={updateVerifyTitle}
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
            disabled={updateVerifyLocked}
            title={updateVerifyTitle}
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
            variant="outline"
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
