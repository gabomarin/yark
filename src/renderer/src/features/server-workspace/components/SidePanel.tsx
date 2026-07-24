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
  const [notes, setNotes] = useState("");
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
          <MetaRow label="Estado" value={status} />
          <MetaRow label="Inicio" value={uptime} />
          <MetaRow label="Versión" value={version} />
          <MetaRow label="Players" value="— / 70" />
          <MetaRow label="Cluster" value={props.server.clusterId ?? "Sin cluster"} />
        </Stack>
      </Card>

      <Card withBorder padding="sm" radius="md" className={classes.card}>
        <Stack gap={6}>
          <Text className={classes.widgetTitle}>Quick Actions</Text>
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
            title={isActive ? "Detén el servidor antes de verificar" : undefined}
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
            title={isActive ? "Detén el servidor antes de actualizar" : undefined}
          >
            Force Update
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
            Save World
          </Button>
          <div className={classes.broadcast}>
            <Textarea
              placeholder="Broadcast message"
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
              Broadcast
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
            Force Shutdown
          </Button>
        </Stack>
      </Card>

      <Card withBorder padding="sm" radius="md" className={classes.card}>
        <Stack gap={6}>
          <Text className={classes.widgetTitle}>Notes</Text>
          <Textarea
            placeholder="Notas locales del servidor (solo en esta sesión)"
            minRows={4}
            size="xs"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
          <Text c="dimmed" fz="xxs">
            Las notas aún no se persisten entre reinicios de la app.
          </Text>
        </Stack>
      </Card>
    </aside>
  );
}
