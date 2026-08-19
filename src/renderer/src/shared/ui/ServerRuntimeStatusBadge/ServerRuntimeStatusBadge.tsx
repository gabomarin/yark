import type { ReactElement } from "react";
import { Badge, type BadgeProps } from "@mantine/core";
import type { ServerStatus } from "@shared/types";
import {
  serverRuntimeStatusColor,
  serverRuntimeStatusLabel,
} from "./serverRuntimeStatus";

interface Props {
  status: ServerStatus | string;
  /** Overrides the default status label (e.g. SteamCMD busy → "Installing…"). */
  label?: string;
  /** Overrides badge color (e.g. busy → blue). */
  color?: string;
  size?: BadgeProps["size"];
  variant?: BadgeProps["variant"];
  className?: string;
}

export function ServerRuntimeStatusBadge({
  status,
  label,
  color,
  size = "xs",
  variant = "light",
  className,
}: Props): ReactElement {
  const text = label ?? serverRuntimeStatusLabel(status);
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
