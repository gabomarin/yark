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
  const manualCountdown =
    props.countdown?.kind === "manual" ? props.countdown : null;
  const remaining = useCountdownRemaining(manualCountdown?.targetAtMs ?? null);

  if (manualCountdown !== null) {
    const label = remaining === null ? "" : formatRestartCountdown(remaining);
    return (
      <Button
        size={size}
        color="red"
        variant="light"
        leftSection={<X size={14} weight="bold" />}
        onClick={props.onCancel}
        data-restart-warning-cancel
      >
        {label.length > 0 ? `Cancel restart · ${label}` : "Cancel restart"}
      </Button>
    );
  }

  const warningDisabled = !props.canRestartWithWarning;
  const warningHint = !props.canRestartWithWarning
    ? "Server must be running and not busy"
    : undefined;

  if (!props.manualRestartWarningsEnabled) {
    return (
      <Button
        size={size}
        variant="filled"
        color="fossil"
        leftSection={restartBusy ? undefined : <ArrowsClockwise size={14} weight="bold" />}
        onClick={props.onRestartNow}
        disabled={!props.canRestartNow}
        loading={restartBusy}
        data-restart-action
      >
        {restartBusy ? "Restarting…" : "Restart now"}
      </Button>
    );
  }

  return (
    <Button.Group>
      <Button
        size={size}
        variant="filled"
        color="fossil"
        leftSection={restartBusy ? undefined : <ArrowsClockwise size={14} weight="bold" />}
        onClick={props.onRestartNow}
        disabled={!props.canRestartNow}
        loading={restartBusy}
        data-restart-action
      >
        {restartBusy ? "Restarting…" : "Restart now"}
      </Button>
      <Menu shadow="md" withinPortal position="bottom-end">
        <Menu.Target>
          <Button
            size={size}
            variant="filled"
            color="fossil"
            px="xs"
            aria-label="More restart options"
            disabled={restartBusy || !props.canRestartNow}
            data-restart-menu-target
          >
            <CaretDown size={14} weight="bold" />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Warning size={16} />}
            disabled={warningDisabled}
            title={warningHint}
            onClick={props.onRestartWithWarning}
            data-restart-with-warning
          >
            Restart with player warning
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Button.Group>
  );
}
