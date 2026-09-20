import type { HTMLAttributes, ReactElement } from "react";
import classes from "./ReadonlyPath.module.css";

type Props = {
  /** Absolute filesystem path, or null/empty when unset. */
  value: string | null | undefined;
  /** Shown when value is missing (muted italic by default). */
  emptyLabel?: string;
  /** Apply muted italic styling when empty. Default true. */
  mutedWhenEmpty?: boolean;
  /** Tighter padding for nested rows (caches, dialogs). */
  compact?: boolean;
  /** Ellipsis the start of long paths so the leaf folder stays visible. */
  truncate?: "start";
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">;

export function ReadonlyPath({
  value,
  emptyLabel = "Not set",
  mutedWhenEmpty = true,
  compact = false,
  truncate,
  className,
  title,
  ...rest
}: Props): ReactElement {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const empty = trimmed.length === 0;
  const display = empty ? emptyLabel : trimmed;
  const muted = empty && mutedWhenEmpty;
  const truncateStart = truncate === "start" && !empty;

  return (
    <div
      role="textbox"
      aria-readonly="true"
      {...rest}
      className={[
        classes.root,
        compact ? classes.compact : null,
        muted ? classes.muted : null,
        truncateStart ? classes.truncateStart : null,
        className ?? null,
      ]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join(" ")}
      title={title ?? (empty ? undefined : trimmed)}
    >
      {truncateStart ? <span className={classes.truncateStartInner}>{display}</span> : display}
    </div>
  );
}
