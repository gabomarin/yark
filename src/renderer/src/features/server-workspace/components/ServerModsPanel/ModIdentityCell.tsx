import type { ReactElement } from "react";
import { Badge, Group, Text, Tooltip } from "@mantine/core";
import { ModThumbnail } from "./ModThumbnail";
import { pickModListCategory, type ModRow } from "./serverModsModel";
import classes from "./ServerModsPanel.module.css";

export function ModIdentityCell(props: { row: ModRow }): ReactElement {
  const row = props.row;
  const category = pickModListCategory(row.categories);
  return (
    <Group wrap="nowrap" gap="sm" miw={0} className={classes.identityGroup}>
      <ModThumbnail src={row.thumbnailUrl} />
      <div className={classes.identity}>
        <Text fw={600} size="sm" lineClamp={1}>{row.name}</Text>
        <Text size="xs" c="dimmed" lineClamp={1}>{row.author}</Text>
        {category.label !== null && (
          <CategoryBadges
            label={category.label}
            extraLabels={category.extraLabels}
            isMap={category.isMap}
          />
        )}
      </div>
    </Group>
  );
}

function CategoryBadges(props: {
  label: string;
  extraLabels: string[];
  isMap: boolean;
}): ReactElement {
  const extras = props.extraLabels.join(", ");
  const badges = (
    <div className={classes.categoryRow}>
      <Badge
        size="xs"
        variant="light"
        tt="none"
        color={props.isMap ? "attention" : "gray"}
        className={classes.categoryBadge}
        title={extras.length === 0 ? props.label : undefined}
      >
        {props.label}
      </Badge>
      {props.extraLabels.length > 0 && (
        <Badge
          size="xs"
          variant="light"
          color="gray"
          tt="none"
          className={classes.categoryExtra}
        >
          +{props.extraLabels.length}
        </Badge>
      )}
    </div>
  );

  if (extras.length === 0) return badges;

  return (
    <Tooltip label={extras} withArrow openDelay={200} multiline maw={240}>
      {badges}
    </Tooltip>
  );
}
