import {
  Broadcast,
  CloudArrowDown,
  FloppyDisk,
  FolderOpen,
  Power,
  ShieldCheck,
  Wrench,
} from "@phosphor-icons/react";
import { Button, Card, Stack, Text, Textarea, Title } from "@mantine/core";
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
      <Card withBorder className={classes.card}>
        <Stack gap="sm">
          <Title order={4}>Server Status</Title>
          <MetaRow label="Estado" value={status} />
          <MetaRow label="Inicio" value={uptime} />
          <MetaRow label="Versión" value={version} />
          <MetaRow label="Server ID" value={props.server.id.slice(0, 8)} />
          <MetaRow
            label="Cluster"
            value={props.server.clusterId ?? "Sin cluster"}
          />
        </Stack>
      </Card>

      <Card withBorder className={classes.card}>
        <Stack gap="xs">
          <Title order={4}>Quick Actions</Title>
          <Button
            variant="light"
            leftSection={<FolderOpen size={16} />}
            onClick={props.onOpenFolder}
          >
            Open folder
          </Button>
          <Button
            variant="light"
            leftSection={<Wrench size={16} />}
            onClick={props.onInstallFiles}
          >
            Install files
          </Button>
          <Button
            variant="light"
            leftSection={<ShieldCheck size={16} />}
            onClick={props.onVerifyFiles}
          >
            Verify integrity
          </Button>
          <Button
            variant="light"
            leftSection={<CloudArrowDown size={16} />}
            onClick={props.onUpdateNow}
          >
            Force Update
          </Button>
          <Button
            variant="light"
            leftSection={<FloppyDisk size={16} />}
            onClick={props.onSaveWorld}
            disabled={status !== "running"}
          >
            Save World
          </Button>
          <div className={classes.broadcast}>
            <Textarea
              placeholder="Broadcast message"
              minRows={2}
              value={broadcast}
              onChange={(event) => setBroadcast(event.currentTarget.value)}
            />
            <Button
              variant="light"
              leftSection={<Broadcast size={16} />}
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
            color="red"
            variant="outline"
            leftSection={<Power size={16} />}
            onClick={props.onKill}
            disabled={status === "stopped"}
          >
            Force Shutdown
          </Button>
        </Stack>
      </Card>

      <Card withBorder className={classes.card}>
        <Stack gap="xs">
          <Title order={4}>Notes</Title>
          <Textarea
            placeholder="Notas locales del servidor (solo en esta sesión)"
            minRows={4}
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
          <Text c="dimmed" size="xs">
            Las notas aún no se persisten entre reinicios de la app.
          </Text>
        </Stack>
      </Card>
    </aside>
  );
}
