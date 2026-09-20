import type { ReactElement, ReactNode } from "react";
import { Group } from "@mantine/core";
import classes from "./AppPathRow.module.css";

interface Props {
  /** The path chip itself (`ReadonlyPath`, or `PathField inline`). */
  children: ReactNode;
  /** Row actions, rendered after the chip (Choose / Open / Install / Clear). */
  actions?: ReactNode;
  className?: string;
  /** Extra data-* hooks forwarded to the row. */
  [key: `data-${string}`]: unknown;
}

/**
 * One recipe for "a path chip with its actions beside it" (Settings and the setup
 * wizard had three copies of the same row CSS under three names). The chip grows
 * and truncates, the actions keep their intrinsic width (#PUX-004).
 */
export function AppPathRow({ children, actions, className, ...dataAttributes }: Props): ReactElement {
  return (
    <div className={[classes.row, className].filter(Boolean).join(" ")} {...dataAttributes}>
      <div className={classes.chip}>{children}</div>
      {actions === undefined ? null : (
        <Group gap="xs" wrap="wrap" className={classes.actions}>
          {actions}
        </Group>
      )}
    </div>
  );
}
