import type { CSSProperties, ReactElement } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { UnstyledButton, Tooltip } from "@mantine/core";
import classes from "./ChromeRailEdgeToggle.module.css";

/** Semicircle height (width is ~half). */
export const CHROME_RAIL_EDGE_TOGGLE_PX = 28;

interface Props {
  iconMode: boolean;
  onToggle: () => void;
  expandLabel: string;
  collapseLabel: string;
  /** Seam positioning (e.g. fixed + left). Applied to the anchor, not the icon. */
  className?: string;
  style?: CSSProperties;
}

/**
 * Half-circle Full/Rail control on the Sidebar seam (#107).
 * Curve faces into the sidenav when expanded (collapse) and into the main area when rail (expand).
 */
export function ChromeRailEdgeToggle(props: Props): ReactElement {
  const label = props.iconMode ? props.expandLabel : props.collapseLabel;
  const direction = props.iconMode ? "expand" : "collapse";
  const anchorClassName = [classes.anchor, props.className].filter(Boolean).join(" ");

  return (
    <span className={anchorClassName} style={props.style} data-direction={direction}>
      <Tooltip label={label} position="right" withArrow openDelay={200}>
        <UnstyledButton
          type="button"
          aria-label={label}
          onClick={props.onToggle}
          className={classes.toggle}
          data-direction={direction}
        >
          <CaretRight size={12} weight="bold" className={classes.caret} aria-hidden />
        </UnstyledButton>
      </Tooltip>
    </span>
  );
}
