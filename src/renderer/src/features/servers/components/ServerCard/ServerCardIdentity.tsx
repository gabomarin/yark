import type { ReactElement } from "react";
import { Group, Text, UnstyledButton } from "@mantine/core";
import { CaretRight } from "@phosphor-icons/react";
import type { ServerProfile } from "@shared/types";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import classes from "./ServerCard.module.css";

interface Props {
  server: ServerProfile;
  compact: boolean;
  openLabel: string;
  onOpenWorkspace: () => void;
}

export function ServerCardIdentity(props: Props): ReactElement {
  const { server, compact, openLabel, onOpenWorkspace } = props;

  return (
    <UnstyledButton
      className={classes.identityOpen}
      onClick={onOpenWorkspace}
      aria-label={openLabel}
      data-open-settings
    >
      <Group
        gap={compact ? "xs" : "sm"}
        align="center"
        wrap="nowrap"
        className={classes.identity}
      >
        <MapArtThumb
          mapId={server.map}
          mapModId={server.mapModId}
          modThumbnailUrl={
            server.mapModId
              ? server.modMetadataCache?.[server.mapModId]?.thumbnailUrl
              : null
          }
          size={compact ? "md" : "lg"}
          shape="rounded"
          className={classes.thumb}
        />
        <div className={classes.identityText}>
          <Text className={classes.title} lineClamp={1}>
            {server.name}
          </Text>
          <Text className={classes.subtitle} c="dimmed" lineClamp={1}>
            {server.sessionName}
          </Text>
        </div>
        <CaretRight
          className={classes.openChevron}
          size={compact ? 16 : 18}
          aria-hidden
        />
      </Group>
    </UnstyledButton>
  );
}
