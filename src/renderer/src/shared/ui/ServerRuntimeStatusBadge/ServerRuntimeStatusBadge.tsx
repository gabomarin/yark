import type { ReactElement } from "react";
import { Group, Text, Tooltip, type BadgeProps } from "@mantine/core";
import type { ServerStatus } from "@shared/types";
import {
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
   * `label` = word + dot (default). `dot` = color-only status like the
   * workspace server rail — frees horizontal space on narrow Overview cards.
   */
  appearance?: "label" | "dot";
}

function statusIsProcessing(status: ServerStatus | string): boolean {
  return status === "starting" || status === "stopping";
}

function toneFromColorOverride(
  color: string | undefined,
): ReturnType<typeof serverRuntimeStatusTone> | null {
  if (color === "blue") return "info";
  if (color === "green") return "ok";
  if (color === "red") return "bad";
  if (color === "gray") return "muted";
  return null;
}

export function ServerRuntimeStatusBadge({
  status,
  label,
  color,
  size = "xs",
  className,
  appearance = "label",
}: Props): ReactElement {
  const text = label ?? serverRuntimeStatusLabel(status);
  const tone = toneFromColorOverride(color) ?? serverRuntimeStatusTone(status);
  const processing = statusIsProcessing(status) || undefined;
  const textSize = size === "sm" || size === "md" || size === "lg" ? "sm" : "xs";

  const dot = (
    <span
      className={classes.statusDot}
      data-tone={tone}
      data-processing={processing}
    />
  );

  if (appearance === "dot") {
    return (
      <Tooltip label={text} withArrow>
        <span
          className={className}
          role="status"
          aria-label={text}
          data-runtime-status-dot
          data-tone={tone}
          data-processing={processing}
        >
          {dot}
        </span>
      </Tooltip>
    );
  }

  return (
    <Group
      gap="xxs"
      wrap="nowrap"
      align="center"
      className={`${classes.statusWord}${className ? ` ${className}` : ""}`}
      role="status"
      aria-label={text}
      data-runtime-status
    >
      {dot}
      <Text size={textSize} fw={600} span data-tone={tone} className={classes.statusLabel}>
        {text}
      </Text>
    </Group>
  );
}
