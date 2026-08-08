import type { CSSProperties, ReactElement } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import classes from "./ChromeRailEdgeToggle.module.css";

export const CHROME_RAIL_EDGE_TOGGLE_PX = 25;

interface Props {
  iconMode: boolean;
  onToggle: () => void;
  expandLabel: string;
  collapseLabel: string;
  /** Seam positioning (e.g. absolute + translate). Applied to the anchor, not the icon. */
  className?: string;
  style?: CSSProperties;
}

/**
 * Docker-style circular Full/Rail control for chrome seams (#107).
 * Parent supplies absolute positioning on the anchor (vertically centered on the pane edge).
 */
export function ChromeRailEdgeToggle(props: Props): ReactElement {
  const label = props.iconMode ? props.expandLabel : props.collapseLabel;
  const anchorClassName = [classes.anchor, props.className].filter(Boolean).join(" ");

  return (
    <span className={anchorClassName} style={props.style}>
      <Tooltip label={label} position="right" withArrow openDelay={200}>
        <ActionIcon
          variant="default"
          radius="xl"
          size={CHROME_RAIL_EDGE_TOGGLE_PX}
          aria-label={label}
          onClick={props.onToggle}
          className={classes.toggle}
        >
          <CaretRight
            size={14}
            weight="bold"
            style={props.iconMode ? undefined : { transform: "rotate(180deg)" }}
          />
        </ActionIcon>
      </Tooltip>
    </span>
  );
}
