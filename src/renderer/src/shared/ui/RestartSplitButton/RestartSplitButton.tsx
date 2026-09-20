import type { ReactElement } from "react";
import { ArrowsClockwise, CaretDown, Warning, X } from "@phosphor-icons/react";
import { Button, Menu } from "@mantine/core";
import type { ServerMaintenanceRuntime } from "@shared/types";
import { formatRestartCountdown, useCountdownRemaining } from "./useCountdownRemaining";

type Countdown = ServerMaintenanceRuntime["countdown"];

interface Props {
  size?: "xs" | "sm" | "md";
  countdown: Countdown;
  /** Per-server "Manual restart warnings" toggle. */
  manualRestartWarningsEnabled: boolean;
  /** Restart now is allowed (running, not busy). Preserves the current flow. */
  canRestartNow: boolean;
  /** Restart with player warning is allowed (setting on, running, not busy). */
  canRestartWithWarning: boolean;
  /** Optimistic restart in flight (before runtime status updates). */
  restartBusy?: boolean;
  /** Disabled-state explanation supplied by the action owner. */
  title?: string;
  onRestartNow: () => void;
  onRestartWithWarning: () => void;
  onCancel: () => void;
}

/**
 * GitHub-style Restart split control (#573), same shape as AddServerSplitButton:
 * primary "Restart now" + chevron for "Restart with player warning". While a
 * manual warning window is armed it collapses to a single Cancel button showing
 * the remaining time.
 */
export function RestartSplitButton(props: Props): ReactElement {
  const size = props.size ?? "sm";
  const restartBusy = props.restartBusy === true;
  const manualCountdown = props.countdown?.kind === "manual" ? props.countdown : null;
  const remaining = useCountdownRemaining(manualCountdown?.targetAtMs ?? null);

  if (manualCountdown !== null) {
    return <ManualRestartCancelButton size={size} remaining={remaining} onCancel={props.onCancel} />;
  }

  if (!props.manualRestartWarningsEnabled) {
    return <RestartNowButton {...props} size={size} restartBusy={restartBusy} />;
  }

  return (
    <Button.Group>
      <RestartNowButton {...props} size={size} restartBusy={restartBusy} />
      <RestartWarningMenu {...props} size={size} restartBusy={restartBusy} />
    </Button.Group>
  );
}

function ManualRestartCancelButton({
  size,
  remaining,
  onCancel,
}: {
  size: NonNullable<Props["size"]>;
  remaining: number | null;
  onCancel: () => void;
}): ReactElement {
  const label = remaining === null ? "" : formatRestartCountdown(remaining);

  return (
    <Button
      size={size}
      color="red"
      variant="default"
      leftSection={<X size={14} weight="bold" />}
      onClick={onCancel}
      data-restart-warning-cancel
    >
      {label.length > 0 ? `Cancel restart · ${label}` : "Cancel restart"}
    </Button>
  );
}

function RestartNowButton({
  size,
  canRestartNow,
  restartBusy,
  onRestartNow,
  title,
}: Pick<Props, "canRestartNow" | "onRestartNow" | "title"> & {
  size: NonNullable<Props["size"]>;
  restartBusy: boolean;
}): ReactElement {
  return (
    <Button
      size={size}
      variant="default"
      leftSection={restartBusy ? undefined : <ArrowsClockwise size={14} weight="bold" />}
      onClick={onRestartNow}
      disabled={!canRestartNow}
      loading={restartBusy}
      title={title}
      data-restart-action
    >
      {restartBusy ? "Restarting…" : "Restart now"}
    </Button>
  );
}

function RestartWarningMenu({
  size,
  restartBusy,
  canRestartNow,
  canRestartWithWarning,
  onRestartWithWarning,
  title,
}: Pick<Props, "canRestartNow" | "canRestartWithWarning" | "onRestartWithWarning" | "title"> & {
  size: NonNullable<Props["size"]>;
  restartBusy: boolean;
}): ReactElement {
  const warningDisabled = !canRestartWithWarning;

  return (
    <Menu shadow="md" withinPortal position="bottom-end">
      <Menu.Target>
        <Button
          size={size}
          variant="default"
          px="xs"
          aria-label="More restart options"
          disabled={restartBusy || !canRestartNow}
          title={title ?? (warningDisabled ? "Server must be running and not busy" : undefined)}
          data-restart-menu-target
        >
          <CaretDown size={14} weight="bold" />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Warning size={16} />}
          disabled={warningDisabled}
          title={warningDisabled ? "Server must be running and not busy" : undefined}
          onClick={onRestartWithWarning}
          data-restart-with-warning
        >
          Restart with player warning
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
