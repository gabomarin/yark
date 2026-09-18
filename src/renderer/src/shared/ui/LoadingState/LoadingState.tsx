import type { ReactElement } from "react";
import { Loader } from "@mantine/core";
import classes from "./LoadingState.module.css";

interface Props {
  /** What is loading, e.g. "backup health". Rendered as "Loading <label>…". */
  label: string;
  /**
   * `inline` = a text line inside a card (default).
   * `block` = centred in the available space, for empty panes.
   */
  variant?: "inline" | "block";
  className?: string;
}

/**
 * One loading state for the whole app (#PUX-004): consistent copy, an optional
 * spinner, and a `role="status"` live region so screen readers announce it.
 * Do not render a bare `<Text c="dimmed">Loading …</Text>` in a feature.
 */
export function LoadingState(props: Props): ReactElement {
  return (
    <div
      className={[classes.root, props.variant === "block" ? classes.block : null, props.className]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-live="polite"
    >
      {props.variant === "block" && <Loader size="sm" />}
      <span className={classes.label}>Loading {props.label}…</span>
    </div>
  );
}
