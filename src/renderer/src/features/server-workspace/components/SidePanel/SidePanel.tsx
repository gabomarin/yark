import {
  Broadcast,
  CloudArrowDown,
  FloppyDisk,
  FolderOpen,
  Power,
  ShieldCheck,
  Wrench,
} from "@phosphor-icons/react";
import { Button, Stack, Text, Textarea } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { useState } from "react";
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
  onBroadcast: (message: string) => void;
  onKill: () => void;
}

function MetaRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className={classes.metaRow}>
      <Text className={classes.metaLabel}>{label}</Text>
      <Text className={classes.metaValue}>{value}</Text>
    </div>
  );
}

export function SidePanel(props: Props): JSX.Element {
  const [broadcast, setBroadcast] = useState("");
  const status = props.runtime?.status ?? "stopped";
  const isActive = status === "starting" || status === "running" || status === "stopping";
  const steamCmdBusy = props.opsLocked === true;
  const installLocked = steamCmdBusy || isActive;
  const updateVerifyLocked = steamCmdBusy;
  const steamCmdLockTitle = props.opsLockReason;
  const installLockTitle =
    steamCmdLockTitle ??
    (isActive ? "Stop the server before installing base files" : undefined);
  const updateVerifyTitle =
    steamCmdLockTitle ??
    (isActive
      ? "Server will be stopped for SteamCMD, then restarted if the job succeeds"
      : undefined);
  const version =
    props.installation?.arkVersion ??
    props.installation?.build ??
    props.installation?.version ??
    "—";
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
            leftSection={<FolderOpen size={14} />}
            onClick={props.onOpenFolder}
          >
            Open folder
          </Button>
          <Button
            size="sm"
            variant="default"
            fullWidth
            justify="flex-start"
            leftSection={<Wrench size={14} />}
            onClick={props.onInstallFiles}
            disabled={installLocked}
            title={installLockTitle}
          >
            Install files
          </Button>
          <Button
            size="sm"
            variant="default"
            fullWidth
            justify="flex-start"
            leftSection={<ShieldCheck size={14} />}
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
            leftSection={<CloudArrowDown size={14} />}
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
            leftSection={<FloppyDisk size={14} />}
            onClick={props.onSaveWorld}
            disabled={status !== "running"}
          >
            Save world
          </Button>
          <div className={classes.broadcast}>
            <Textarea
              placeholder="Message for players"
              minRows={2}
              size="xs"
              value={broadcast}
              onChange={(event) => setBroadcast(event.currentTarget.value)}
            />
            <Button
              size="sm"
              variant="default"
              fullWidth
              justify="flex-start"
              leftSection={<Broadcast size={14} />}
              disabled={status !== "running" || broadcast.trim().length === 0}
              onClick={() => {
                props.onBroadcast(broadcast.trim());
                setBroadcast("");
              }}
            >
              Enviar anuncio
            </Button>
          </div>
          <Button
            size="sm"
            color="red"
            variant="outline"
            fullWidth
            justify="flex-start"
            leftSection={<Power size={14} />}
            onClick={props.onKill}
            disabled={status === "stopped"}
          >
            Force close
          </Button>
        </Stack>
      </AppSurfaceCard>
    </aside>
  );
}
