import type { ReactElement, ReactNode } from "react";
import { Tooltip } from "@mantine/core";
import classes from "./CompactSegmented.module.css";

/** Mantine SegmentedControl root class for compact icon-only segments (Overview layout switch). */
export const compactSegmentedRootClass = classes.root;

/** Root class for compact segments with visible icon + text (INI file/mode switches). */
export const compactLabeledSegmentedRootClass = `${classes.root} ${classes.rootLabeled}`;

/** Icon segment label with tooltip + accessible name (Overview grouping switch pattern). */
export function compactIconSegmentLabel(tooltip: string, ariaLabel: string, icon: ReactNode): ReactElement {
  return (
    <Tooltip label={tooltip} withArrow>
      <span className={classes.icon} aria-label={ariaLabel}>
        {icon}
      </span>
    </Tooltip>
  );
}

/** Icon + visible text segment label. `pending` adds the unsaved dot for another view. */
export function compactLabeledSegmentLabel(text: string, icon: ReactNode, pending = false): ReactElement {
  return (
    <span className={classes.labeled}>
      {icon != null ? (
        <span className={classes.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={classes.labelText}>{text}</span>
      {pending ? (
        <>
          <span className={classes.pendingDot} aria-hidden="true" />
          <span className={classes.pendingNote}>Unsaved changes</span>
        </>
      ) : null}
    </span>
  );
}
