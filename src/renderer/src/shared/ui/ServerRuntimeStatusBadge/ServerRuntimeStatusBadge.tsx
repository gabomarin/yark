import type { ReactElement } from "react";
import { Badge, Tooltip, type BadgeProps } from "@mantine/core";
import type { ServerStatus } from "@shared/types";
import {
  serverRuntimeStatusColor,
  serverRuntimeStatusLabel,
  serverRuntimeStatusTone,
} from "./serverRuntimeStatus";
import classes from "./ServerRuntimeStatusBadge.module.css";

interface Props {
  status: ServerStatus | string;
  /** Overrides the default status label (e.g. SteamCMD busy → "Installing…"). */
  label?: string;
  /** Overrides badge color (e.g. busy → blue). */
  color?: string;
  size?: BadgeProps["size"];
  variant?: BadgeProps["variant"];
  className?: string;
  /**
   * `label` = text Badge (default). `dot` = color-only status like the
   * workspace server rail — frees horizontal space on narrow Overview cards.
   */
  appearance?: "label" | "dot";
}

function statusIsProcessing(status: ServerStatus | string): boolean {
  return status === "starting" || status === "stopping";
}

export function ServerRuntimeStatusBadge({
  status,
  label,
  color,
  size = "xs",
  variant = "light",
  className,
  appearance = "label",
}: Props): ReactElement {
  const text = label ?? serverRuntimeStatusLabel(status);
  const tone =
    color === "blue"
      ? "info"
      : color === "green"
        ? "ok"
        : color === "red"
          ? "bad"
          : color === "gray"
            ? "muted"
            : serverRuntimeStatusTone(status);

  if (appearance === "dot") {
    return (
      <Tooltip label={text} withArrow>
        <span
          className={`${classes.statusDot}${className ? ` ${className}` : ""}`}
          data-tone={tone}
          data-processing={statusIsProcessing(status) || undefined}
          data-runtime-status-dot
          role="status"
          aria-label={text}
        />
      </Tooltip>
    );
  }

  return (
    <Badge
      size={size}
      variant={variant}
      tt="none"
      color={color ?? serverRuntimeStatusColor(status)}
      className={className}
    >
      {text}
    </Badge>
  );
}
