import type { ReactElement } from "react";
import { ActionIcon, Button, Image, Text, Tooltip } from "@mantine/core";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { MapsSearchRow } from "./mapsSearchModel";
import classes from "./ServerFormMapsSearchModal.module.css";

interface Props {
  row: MapsSearchRow;
  onUse: () => void;
  onInspect: () => void;
}

export function ServerFormMapsSearchCard(props: Props): ReactElement {
  const { mod, token } = props.row;
  const thumb = mod.thumbnailUrl?.trim() ?? "";
  return (
    <article className={classes.card}>
      <div className={classes.thumbWrap}>
        {thumb.length > 0 ? (
          <Image src={thumb} alt="" className={classes.thumb} fit="cover" />
        ) : (
          <div className={classes.thumb} aria-hidden />
        )}
        <Tooltip label="View details">
          <ActionIcon
            className={classes.infoBtn}
            variant="filled"
            size="sm"
            radius="md"
            aria-label={`View details for ${mod.name}`}
            onClick={(event) => {
              event.stopPropagation();
              props.onInspect();
            }}
          >
            <MagnifyingGlass size={14} weight="bold" />
          </ActionIcon>
        </Tooltip>
      </div>
      <div className={classes.cardBody}>
        <Text size="sm" fw={600} lineClamp={2}>
          {mod.name}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={1}>
          {(mod.authors ?? []).join(", ") || "Unknown author"}
        </Text>
        <Text size="xs" c="dimmed">
          {mod.downloadCount.toLocaleString()} downloads
        </Text>
        {token?.source === "labeled" ? (
          <Text className={classes.tokenOk}>Map Name: {token.token}</Text>
        ) : token?.source === "bare" ? (
          <Text className={classes.tokenWarn}>Weak *_WP: {token.token}</Text>
        ) : (
          <Text className={classes.tokenWarn}>
            No Map Name inferred — you&apos;ll type it next
          </Text>
        )}
        <Button className={classes.useMapBtn} size="compact-sm" onClick={props.onUse}>
          Use map
        </Button>
      </div>
    </article>
  );
}
