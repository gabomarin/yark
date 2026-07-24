import {
  Broadcast,
  CloudArrowDown,
  FloppyDisk,
  FolderOpen,
  Power,
  ShieldCheck,
  Wrench,
} from "@phosphor-icons/react";
import { Button, Card, Stack, Text, Textarea } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { useState } from "react";
import classes from "./SidePanel.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  onOpenFolder: () => void;
  onInstallFiles: () => void;
  onUpdateNow: () => void;
  onVerifyFiles: () => void;
  onSaveWorld: () => void;
  onBroadcast: (message: string) => void;
  onKill: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  error: "Error",
};

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
      <Card withBorder padding="sm" radius="md" className={classes.card}>
        <Stack gap={6}>
          <Text className={classes.widgetTitle}>Status</Text>
          <MetaRow label="Status" value={STATUS_LABEL[status] ?? status} />
          <MetaRow label="Inicio" value={uptime} />
          <MetaRow label="Version" value={version} />
          <MetaRow label="Cluster" value={props.server.clusterId ?? "No cluster"} />
        </Stack>
      </Card>

      <Card withBorder padding="sm" radius="md" className={classes.card}>
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
            disabled={isActive}
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
            disabled={isActive}
            title={isActive ? "Stop the server before verifying" : undefined}
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
            disabled={isActive}
            title={isActive ? "Stop the server before updating" : undefined}
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
      </Card>
    </aside>
  );
}
