import type { ReactElement } from "react";
import type { ServerStatus } from "@shared/types";
import { StatusWord, type StatusWordTone } from "@ui/StatusWord/StatusWord";
import { serverRuntimeStatusLabel, serverRuntimeStatusTone } from "./serverRuntimeStatus";

interface Props {
  status: ServerStatus | string;
  /** Overrides the default status label (e.g. SteamCMD busy → "Installing…"). */
  label?: string;
  /** Overrides badge color (e.g. busy → blue). */
  color?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  /**
   * `label` = word + dot (default). `dot` = color-only status like the
   * workspace server rail - frees horizontal space on narrow Overview cards.
   */
  appearance?: "label" | "dot";
}

function statusIsProcessing(status: ServerStatus | string): boolean {
  return status === "starting" || status === "stopping";
}

function toneFromColorOverride(color: string | undefined): StatusWordTone | null {
  if (color === "blue") return "info";
  if (color === "ok") return "ok";
  if (color === "red") return "danger";
  if (color === "gray") return "neutral";
  return null;
}

/** Maps the server process lifecycle onto the shared status atom. */
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

  return (
    <StatusWord
      tone={tone}
      appearance={appearance}
      processing={statusIsProcessing(status)}
      label={text}
      size={size === "sm" || size === "md" || size === "lg" ? "sm" : "xs"}
      className={className}
      data-runtime-status={appearance === "label" ? "" : undefined}
      data-runtime-status-dot={appearance === "dot" ? "" : undefined}
    >
      {text}
    </StatusWord>
  );
}
