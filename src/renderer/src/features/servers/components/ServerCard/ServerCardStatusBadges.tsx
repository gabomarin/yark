import type { ReactElement } from "react";
import { Text } from "@mantine/core";
import type { ServerStatus } from "@shared/types";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import classes from "./ServerCard.module.css";

interface Props {
  status: ServerStatus;
  startBusy: boolean;
  stopBusy: boolean;
  serverEnabled: boolean;
  compact: boolean;
}

/** Label + CSS-swapped status dot for narrow card containers (#302). */
export function ServerCardStatusBadges(props: Props): ReactElement {
  const displayStatus =
    props.startBusy && (props.status === "stopped" || props.status === "error")
      ? "starting"
      : props.status;
  const statusLabel = props.stopBusy
    ? "Stopping…"
    : props.startBusy && (props.status === "stopped" || props.status === "error")
      ? "Starting…"
      : undefined;
  const statusColor =
    props.stopBusy
    || (props.startBusy && (props.status === "stopped" || props.status === "error"))
      ? "blue"
      : undefined;

  return (
    <div className={classes.statusBadges}>
      <span className={classes.statusLabelSlot}>
        <ServerRuntimeStatusBadge
          status={displayStatus}
          label={statusLabel}
          color={statusColor}
          appearance="label"
        />
      </span>
      <span className={classes.statusDotSlot}>
        <ServerRuntimeStatusBadge
          status={displayStatus}
          label={statusLabel}
          color={statusColor}
          appearance="dot"
        />
      </span>
      {!props.serverEnabled && (
        <Text size={props.compact ? "xs" : "sm"} c="dimmed">
          Inactive
        </Text>
      )}
    </div>
  );
}
