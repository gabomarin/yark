import type { ReactElement } from "react";
import { Stack, Text } from "@mantine/core";
import { KNOWN_MAP_OPTIONS } from "@shared/types";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import classes from "./ServerForm.module.css";

interface Props {
  name: string;
  mapToken: string;
  mapModId: string | null;
  modThumbnailUrl?: string | null;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  compact?: boolean;
}

function mapLabel(mapToken: string): string {
  const known = KNOWN_MAP_OPTIONS.find((entry) => entry.id === mapToken);
  if (known !== undefined) {
    return known.label;
  }
  const trimmed = mapToken.trim();
  return trimmed.length > 0 ? trimmed : "Custom map";
}

/** Identity scan strip: map art + name + ports (#292). */
export function ServerFormIdentityHero(props: Props): ReactElement {
  const title = props.name.trim().length > 0 ? props.name.trim() : "Untitled profile";
  const ports = `${props.gamePort || "–"}/${props.queryPort || "–"}/${props.rconPort || "–"}`;

  return (
    <div className={classes.identityHero} data-identity-hero>
      <MapArtThumb
        mapId={props.mapToken}
        mapModId={props.mapModId}
        modThumbnailUrl={props.modThumbnailUrl}
        size={props.compact === true ? "md" : "lg"}
        shape="tek"
        decorative
      />
      <Stack gap={2} className={classes.identityHeroCopy}>
        <Text fw={650} fz={props.compact === true ? "md" : "lg"} lh={1.25} lineClamp={2}>
          {title}
        </Text>
        <Text fz="sm" c="dimmed">
          {mapLabel(props.mapToken)} · {ports}
        </Text>
      </Stack>
    </div>
  );
}
