import type { ReactElement } from "react";
import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { Fragment, useMemo, useState } from "react";
import { AddServerSplitButton } from "@features/servers/components/AddServerSplitButton/AddServerSplitButton";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import { SearchField } from "@ui/SearchField/SearchField";
import {
  serverRuntimeStatusLabel,
  serverRuntimeStatusTone,
} from "@ui/ServerRuntimeStatusBadge/serverRuntimeStatus";
import { groupServersByCluster } from "../../workspaceLayoutModel";
import classes from "./ServerListPanel.module.css";

interface Props {
  servers: ServerProfile[];
  selectedServerId: string;
  statuses: Map<string, ServerRuntimeInfo>;
  onSelectServer: (serverId: string) => void;
  onAddServer?: () => void;
  onImportServer?: () => void;
  /** Compact icon-rail (#107). */
  iconMode?: boolean;
  /** Explicit Full ↔ Rail toggle (wide layout). */
  onToggleRail?: () => void;
}

function rowAccessibleName(server: ServerProfile, status: string): string {
  const parts = [server.name, server.map, serverRuntimeStatusLabel(status)];
  if (!server.enabled) {
    parts.push("Inactive");
  }
  if (server.clusterId?.trim()) {
    parts.push(server.clusterId.trim());
  }
  return parts.join(" · ");
}

function ServerRow(props: {
  server: ServerProfile;
  status: string;
  selected: boolean;
  iconMode: boolean;
  onSelect: () => void;
}): ReactElement {
  const tone = serverRuntimeStatusTone(props.status);
  const accessibleName = rowAccessibleName(props.server, props.status);

  return (
    <Tooltip
      label={accessibleName}
      position="right"
      withArrow
      openDelay={200}
      disabled={!props.iconMode}
    >
      <UnstyledButton
        className={classes.item}
        data-selected={props.selected || undefined}
        data-status-tone={tone}
        aria-label={accessibleName}
        onClick={props.onSelect}
      >
        <span className={classes.thumbWrap}>
          <MapArtThumb
            mapId={props.server.map}
            mapModId={props.server.mapModId}
            modThumbnailUrl={
              props.server.mapModId
                ? props.server.modMetadataCache?.[props.server.mapModId]?.thumbnailUrl
                : null
            }
            size="sm"
            shape="rounded"
            decorative
            className={classes.thumb}
          />
          {props.iconMode && <span className={classes.statusDot} aria-hidden="true" />}
        </span>
        {!props.iconMode && (
          <>
            <span className={classes.itemBody} aria-hidden="true">
              <Text className={classes.itemName} fw={600} title={props.server.name} lineClamp={1}>
                {props.server.name}
              </Text>
              <Text
                className={classes.itemMeta}
                c="dimmed"
                title={props.server.map}
                lineClamp={1}
              >
                {props.server.map}
              </Text>
              {!props.server.enabled && (
                <Badge size="xs" variant="light" color="gray" mt={4} tt="none">
                  Inactive
                </Badge>
              )}
            </span>
            <span
              className={classes.statusDotInline}
              data-status-tone={tone}
              title={serverRuntimeStatusLabel(props.status)}
              aria-hidden="true"
            />
          </>
        )}
      </UnstyledButton>
    </Tooltip>
  );
}

export function ServerListPanel(props: Props): ReactElement {
  const [search, setSearch] = useState("");
  const [openClusters, setOpenClusters] = useState<Record<string, boolean>>({});
  const iconMode = props.iconMode === true;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) return props.servers;
    return props.servers.filter((server) =>
      [server.name, server.map, server.clusterId ?? ""].some((field) =>
        field.toLowerCase().includes(query),
      ),
    );
  }, [props.servers, search]);

  const groups = useMemo(() => groupServersByCluster(filtered), [filtered]);

  function isClusterOpen(key: string): boolean {
    const containsSelected = groups
      .find((group) => group.key === key)
      ?.servers.some((server) => server.id === props.selectedServerId);
    if (containsSelected === true) {
      return true;
    }
    return openClusters[key] !== false;
  }

  function toggleCluster(key: string): void {
    setOpenClusters((prev) => ({
      ...prev,
      [key]: !(prev[key] !== false),
    }));
  }

  return (
    <aside className={classes.panel} data-icon-mode={iconMode || undefined}>
      <div className={classes.header} data-icon-mode={iconMode || undefined}>
        {iconMode ? (
          props.onToggleRail !== undefined && (
            <Tooltip label="Expand server list" position="right" withArrow>
              <ActionIcon
                variant="subtle"
                size="md"
                aria-label="Expand server list"
                onClick={props.onToggleRail}
              >
                <CaretRight size={16} />
              </ActionIcon>
            </Tooltip>
          )
        ) : (
          <>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text className={classes.title}>All servers</Text>
              {props.onToggleRail !== undefined && (
                <Tooltip label="Collapse to icon rail">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label="Collapse to icon rail"
                    onClick={props.onToggleRail}
                  >
                    <CaretRight size={14} style={{ transform: "rotate(180deg)" }} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search servers"
              label="Search servers"
              size="xs"
            />
          </>
        )}
      </div>

      <Stack gap={iconMode ? 4 : 8} className={classes.list}>
        {iconMode
          ? groups.map((group, index) => (
              <Fragment key={group.key}>
                {index > 0 && (
                  <Divider
                    className={classes.clusterDivider}
                    aria-label={`${group.label} cluster`}
                  />
                )}
                <Stack gap={4} className={classes.clusterRail} role="group" aria-label={group.label}>
                  {group.servers.map((server) => {
                    const status = props.statuses.get(server.id)?.status ?? "stopped";
                    return (
                      <ServerRow
                        key={server.id}
                        server={server}
                        status={status}
                        selected={server.id === props.selectedServerId}
                        iconMode
                        onSelect={() => props.onSelectServer(server.id)}
                      />
                    );
                  })}
                </Stack>
              </Fragment>
            ))
          : groups.map((group) => {
              const open = isClusterOpen(group.key);
              return (
                <section key={group.key} className={classes.cluster}>
                  <UnstyledButton
                    className={classes.clusterHeader}
                    onClick={() => toggleCluster(group.key)}
                    aria-expanded={open}
                  >
                    {open ? (
                      <CaretDown size={12} className={classes.clusterCaret} />
                    ) : (
                      <CaretRight size={12} className={classes.clusterCaret} />
                    )}
                    <Text className={classes.clusterLabel}>{group.label}</Text>
                    <Text className={classes.clusterCount} c="dimmed">
                      {group.servers.length}
                    </Text>
                  </UnstyledButton>
                  {open && (
                    <Stack gap={6} className={classes.clusterList}>
                      {group.servers.map((server) => {
                        const status = props.statuses.get(server.id)?.status ?? "stopped";
                        return (
                          <ServerRow
                            key={server.id}
                            server={server}
                            status={status}
                            selected={server.id === props.selectedServerId}
                            iconMode={false}
                            onSelect={() => props.onSelectServer(server.id)}
                          />
                        );
                      })}
                    </Stack>
                  )}
                </section>
              );
            })}
        {filtered.length === 0 && (
          <Text c="dimmed" size="sm" ta="center" py="md">
            {iconMode ? "—" : "No servers"}
          </Text>
        )}
      </Stack>

      {props.onAddServer !== undefined && (
        <div className={classes.footer}>
          {iconMode ? (
            <Group gap={4} justify="center" wrap="nowrap">
              <Tooltip label="Add server" position="right" withArrow>
                <ActionIcon
                  variant="light"
                  size="lg"
                  aria-label="Add server"
                  onClick={props.onAddServer}
                >
                  <Plus size={18} />
                </ActionIcon>
              </Tooltip>
              {props.onImportServer !== undefined && (
                <Menu shadow="md" withinPortal position="right-end">
                  <Menu.Target>
                    <ActionIcon
                      variant="default"
                      size="lg"
                      aria-label="More add-server options"
                    >
                      <CaretDown size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={props.onImportServer}>
                      Import install
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
            </Group>
          ) : props.onImportServer !== undefined ? (
            <AddServerSplitButton
              primaryLabel="Add server"
              onCreate={props.onAddServer}
              onImport={props.onImportServer}
              fullWidth
              size="sm"
            />
          ) : (
            <Button
              fullWidth
              size="sm"
              variant="light"
              leftSection={<Plus size={16} />}
              onClick={props.onAddServer}
            >
              Add server
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
