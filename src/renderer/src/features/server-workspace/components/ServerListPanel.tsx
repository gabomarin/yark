import { CaretRight, HardDrives, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Badge, Button, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { useMemo, useState } from "react";
import classes from "./ServerListPanel.module.css";

interface Props {
  servers: ServerProfile[];
  selectedServerId: string;
  statuses: Map<string, ServerRuntimeInfo>;
  onSelectServer: (serverId: string) => void;
  onAddServer?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  stopped: "OFFLINE",
  starting: "STARTING",
  running: "ONLINE",
  stopping: "STOPPING",
  error: "ERROR",
};

function statusTone(status: string): "ok" | "warn" | "bad" | "info" | "muted" {
  if (status === "running") return "ok";
  if (status === "starting" || status === "stopping") return "info";
  if (status === "error") return "bad";
  return "muted";
}

export function ServerListPanel(props: Props): JSX.Element {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) return props.servers;
    return props.servers.filter((server) =>
      [server.name, server.map, server.clusterId ?? ""].some((field) =>
        field.toLowerCase().includes(query),
      ),
    );
  }, [props.servers, search]);

  return (
    <aside className={classes.panel}>
      <div className={classes.header}>
        <Text className={classes.title}>All Servers</Text>
        <TextInput
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Search servers"
          leftSection={<MagnifyingGlass size={14} />}
          size="xs"
        />
      </div>

      <Stack gap={6} className={classes.list}>
        {filtered.map((server) => {
          const status = props.statuses.get(server.id)?.status ?? "stopped";
          const selected = server.id === props.selectedServerId;
          const tone = statusTone(status);
          return (
            <UnstyledButton
              key={server.id}
              className={classes.item}
              data-selected={selected || undefined}
              onClick={() => props.onSelectServer(server.id)}
            >
              <span className={classes.thumb} data-tone={tone}>
                <HardDrives size={18} weight="duotone" />
              </span>
              <span className={classes.itemBody}>
                <Text className={classes.itemName} fz="sm" fw={600} lineClamp={1}>
                  {server.name}
                </Text>
                <Text className={classes.itemMeta} fz="xxs" c="dimmed" lineClamp={1}>
                  {server.map}
                </Text>
                <Text className={classes.itemPlayers} fz="micro" c="dimmed">
                  — / 70
                </Text>
              </span>
              <Badge
                size="xs"
                variant="light"
                className={classes.badge}
                color={
                  tone === "ok"
                    ? "green"
                    : tone === "bad"
                      ? "red"
                      : tone === "info"
                        ? "blue"
                        : "gray"
                }
              >
                {STATUS_LABEL[status] ?? status}
              </Badge>
              <CaretRight size={14} className={classes.chevron} />
            </UnstyledButton>
          );
        })}
        {filtered.length === 0 && (
          <Text c="dimmed" size="sm" ta="center" py="md">
            Sin servidores
          </Text>
        )}
      </Stack>

      {props.onAddServer !== undefined && (
        <div className={classes.footer}>
          <Button
            fullWidth
            size="sm"
            variant="light"
            leftSection={<Plus size={16} />}
            onClick={props.onAddServer}
          >
            Add Server
          </Button>
        </div>
      )}
    </aside>
  );
}
