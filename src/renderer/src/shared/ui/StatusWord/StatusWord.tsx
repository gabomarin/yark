import { forwardRef, type ReactNode } from "react";
import { Tooltip } from "@mantine/core";
import classes from "./StatusWord.module.css";

/** Shared status tones. `danger` is the text-safe red; `neutral` is a quiet default. */
export type StatusWordTone = "ok" | "info" | "warn" | "danger" | "neutral";

interface Props {
  tone: StatusWordTone;
  /** `label` = word + dot (default). `dot` = dot only, with the word as tooltip + a11y name. */
  appearance?: "label" | "dot";
  /** Pulses the dot for in-flight states (starting / stopping). */
  processing?: boolean;
  /** Accessible name, and the tooltip in `dot` appearance. Defaults to a string child. */
  label?: string;
  size?: "xs" | "sm";
  className?: string;
  children?: ReactNode;
  /** Extra data-* hooks (e.g. `data-runtime-status`) forwarded to the root. */
  [key: `data-${string}`]: string | undefined;
}

/**
 * Word + status dot — the single status atom (#PUX-004). Domain wrappers
 * (`ServerRuntimeStatusBadge`) map their state onto a `tone`; do not build another
 * dot + label pair.
 */
export const StatusWord = forwardRef<HTMLSpanElement, Props>(function StatusWord(props, ref) {
  const {
    tone,
    appearance = "label",
    processing = false,
    size = "xs",
    className,
    children,
    label,
    ...dataAttributes
  } = props;
  const text = label ?? (typeof children === "string" ? children : undefined);
  const shared = {
    "data-tone": tone,
    "data-size": size,
    "data-processing": processing || undefined,
    ...dataAttributes,
  };
  const dot = <span className={classes.dot} data-tone={tone} />;
  const classNames = [classes.root, appearance === "dot" ? classes.dotOnly : null, className].filter(Boolean).join(" ");

  const marker = (
    <span ref={ref} className={classNames} role="status" aria-label={text} {...shared}>
      {dot}
      {appearance === "label" && <span className={classes.label}>{children ?? text}</span>}
    </span>
  );

  return appearance === "dot" && text !== undefined ? (
    <Tooltip label={text} withArrow>
      {marker}
    </Tooltip>
  ) : (
    marker
  );
});
StatusWord.displayName = "StatusWord";
