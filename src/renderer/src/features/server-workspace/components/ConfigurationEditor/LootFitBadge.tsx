import type { ReactElement } from "react";
import { Badge, Tooltip } from "@mantine/core";
import { supplyCrateFitLabel, supplyCrateRemovable, type SupplyCrateFit } from "@shared/asa/asa-supply-crate-catalog";

const FIT_COLOR: Record<SupplyCrateFit, string> = {
  active: "blue",
  shared: "gray",
  unused: "yellow",
  unknown: "gray",
};

interface Props {
  fit: SupplyCrateFit;
  hint: string;
}

/** Shown only when this map does not use the crate, or the class is outside the list. */
export function LootFitBadge(props: Props): ReactElement | null {
  if (!supplyCrateRemovable(props.fit)) return null;
  return (
    <Tooltip label={props.hint} multiline maw={280} withArrow>
      <Badge component="span" size="xs" variant="light" color={FIT_COLOR[props.fit]} style={{ cursor: "help" }}>
        {supplyCrateFitLabel(props.fit)}
      </Badge>
    </Tooltip>
  );
}
