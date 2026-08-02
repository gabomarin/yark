import type { ReactElement } from "react";
import { CaretRight, HardDrives, Plus } from "@phosphor-icons/react";
import { Badge, Button, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { useMemo, useState } from "react";
import { SearchField } from "@ui/SearchField/SearchField";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import { serverRuntimeStatusTone } from "@ui/ServerRuntimeStatusBadge/serverRuntimeStatus";
import classes from "./ServerListPanel.module.css";

interface Props {
  servers: ServerProfile[];
  selectedServerId: string;
  statuses: Map<string, ServerRuntimeInfo>;
  onSelectServer: (serverId: string) => void;
  onAddServer?: () => void;
}

export function ServerListPanel(props: Props): ReactElement {
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
        <Text className={classes.title}>All servers</Text>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search servers"
          label="Search servers"
          size="xs"
        />
      </div>

      <Stack gap={6} className={classes.list}>
        {filtered.map((server) => {
          const status = props.statuses.get(server.id)?.status ?? "stopped";
          const selected = server.id === props.selectedServerId;
          const tone = serverRuntimeStatusTone(status);
          return (
            <UnstyledButton
              key={server.id}
              className={classes.item}
              data-selected={selected || undefined}
              onClick={() => props.onSelectServer(server.id)}
            >
              <span className={classes.thumb} data-tone={tone}>
                <HardDrives size={16} weight="duotone" />
              </span>
              <span className={classes.itemBody}>
                <Group gap={6} wrap="nowrap">
                  <Text className={classes.itemName} fw={600} title={server.name} lineClamp={1}>
                    {server.name}
                  </Text>
                  {!server.enabled && (
                    <Badge size="xs" color="gray" variant="light">
                      Inactive
                    </Badge>
                  )}
                </Group>
                <Text className={classes.itemMeta} c="dimmed" title={server.map} lineClamp={1}>
                  {server.map}
                </Text>
              </span>
              <ServerRuntimeStatusBadge status={status} size="xs" className={classes.badge} />
              <CaretRight size={12} className={classes.chevron} />
            </UnstyledButton>
          );
        })}
        {filtered.length === 0 && (
          <Text c="dimmed" size="sm" ta="center" py="md">
            No servers
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
            Add server
          </Button>
        </div>
      )}
    </aside>
  );
}
