import type { ReactElement, ReactNode } from "react";
import { Tooltip } from "@mantine/core";
import classes from "./CompactSegmented.module.css";

/** Mantine SegmentedControl root class for compact icon-only segments (Overview layout switch). */
export const compactSegmentedRootClass = classes.root;

/** Icon segment label with tooltip + accessible name (Overview grouping switch pattern). */
export function compactIconSegmentLabel(
  tooltip: string,
  ariaLabel: string,
  icon: ReactNode,
): ReactElement {
  return (
    <Tooltip label={tooltip} withArrow>
      <span className={classes.icon} aria-label={ariaLabel}>
        {icon}
      </span>
    </Tooltip>
  );
}
