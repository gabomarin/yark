import type { ReactElement } from "react";
import { Badge, Text, Tooltip, UnstyledButton } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import {
  serverRuntimeStatusLabel,
  serverRuntimeStatusTone,
} from "@ui/ServerRuntimeStatusBadge/serverRuntimeStatus";
import classes from "./ServerListPanel.module.css";

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

export function ServerListPanelRow(props: {
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
