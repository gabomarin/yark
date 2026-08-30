import { Button, Group, Text } from "@mantine/core";
import type { MaintenancePolicyStatus } from "@shared/types";
import type { ReactElement } from "react";
import { DAY_LABELS } from "../../model/maintenancePanelModel";
import classes from "../../MaintenancePanel.module.css";

interface Props {
  policy: MaintenancePolicyStatus;
  busy: boolean;
  onRunRestartNow: () => void;
  onRunUpdateNow: () => void;
  onCancelUpcoming: () => void;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1_000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Up next hero — empty, armed, or live countdown (#487 / #489). */
export function MaintenanceUpNext(props: Props): ReactElement {
  const policy = props.policy;
  const armed =
    policy.restartEnabled || policy.wipeEnabled || policy.updateEnabled;
  const live =
    policy.countdownPhase === "warning"
    || policy.countdownPhase === "last_minute"
    || policy.countdownPhase === "restarting"
    || policy.countdownPhase === "updating";
  const isUpdateWindow = policy.countdownKind === "update";

  if (!armed && !live) {
    return (
      <section className={classes.slab} data-maintenance-up-next>
        <div className={classes.upNextBody}>
          <Text className={classes.upNextLabel}>Up next</Text>
          <h2 className={classes.upNextTitle}>Nothing scheduled</h2>
          <Text size="sm" c="dimmed" mt={4} maw={480}>
            Turn on a job below. Restart and wipe share one weekly window;
            auto-update runs on its own when a new Ark server update is out.
          </Text>
        </div>
      </section>
    );
  }

  const day = DAY_LABELS[policy.restartDayOfWeek] ?? "Sunday";
  let title: string;
  let subtitle: string;

  if (live && policy.countdownRemainingMs !== null) {
    if (policy.countdownPhase === "updating") {
      title = "Updating…";
      subtitle = "Safe update with backup · queued in Downloads";
    } else if (policy.countdownPhase === "restarting") {
      title = "Restarting…";
      subtitle = "Graceful restart with backup";
    } else {
      const verb = isUpdateWindow ? "Update" : "Restart";
      title = `${verb} in ${formatCountdown(policy.countdownRemainingMs)}`;
      subtitle =
        policy.countdownPhase === "last_minute"
          ? "Final warnings every second · Cancel stops them immediately"
          : "Players are being warned in-game";
    }
  } else if (policy.restartEnabled) {
    title =
      policy.restartCadence === "daily"
        ? `Restart · Daily ${policy.restartTimeLocal}`
        : `Restart · ${day} ${policy.restartTimeLocal}`;
    const nextHint =
      policy.nextRestartAt !== null
        ? ` · next ${new Date(policy.nextRestartAt).toLocaleString()}`
        : "";
    subtitle = `Local time · players warned before stop${
      policy.wipeEnabled ? " · then wipe wild dinos" : ""
    }${nextHint}`;
  } else if (policy.updateEnabled) {
    title = "Waiting for a new Ark server update";
    subtitle =
      "Starts when Steam reports a newer dedicated build. Restart schedule not required.";
  } else {
    title = "Wild dino wipe";
    subtitle = "Needs a restart schedule — wipe runs when that restart finishes";
  }

  const lastRestartLine =
    policy.lastRestartAt !== null
      ? `Last restart · ${policy.lastRestartOk === false ? "failed" : "OK"} · ${new Date(
          policy.lastRestartAt,
        ).toLocaleString()}`
      : policy.restartEnabled
        ? "Last restart · —"
        : null;
  const lastUpdateLine =
    policy.updateEnabled && policy.lastUpdateAt !== null
      ? `Last auto-update · ${policy.lastUpdateOk === false ? "failed" : "OK"} · ${new Date(
          policy.lastUpdateAt,
        ).toLocaleString()}`
      : null;

  return (
    <section className={classes.slab} data-maintenance-up-next>
      <div className={classes.upNextBody}>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Text className={classes.upNextLabel}>Up next</Text>
            <h2 className={classes.upNextTitle}>{title}</h2>
            <Text size="sm" c="dimmed" mt={4}>
              {subtitle}
            </Text>
            {lastRestartLine !== null && (
              <Text size="xs" c="dimmed" mt={4}>
                {lastRestartLine}
              </Text>
            )}
            {lastUpdateLine !== null && (
              <Text size="xs" c="dimmed" mt={lastRestartLine === null ? 4 : 2}>
                {lastUpdateLine}
              </Text>
            )}
          </div>
          <Group gap="xs" wrap="wrap">
            {policy.cancelable && (
              <Button
                size="xs"
                color="red"
                variant="light"
                loading={props.busy}
                onClick={props.onCancelUpcoming}
              >
                Cancel window
              </Button>
            )}
            {policy.restartEnabled
              && !live
              && policy.countdownPhase === "idle" && (
              <Button
                size="xs"
                loading={props.busy}
                onClick={props.onRunRestartNow}
              >
                Run restart now
              </Button>
            )}
            {policy.updateEnabled
              && !live
              && policy.countdownPhase === "idle" && (
              <Button
                size="xs"
                variant="light"
                loading={props.busy}
                onClick={props.onRunUpdateNow}
              >
                Run update now
              </Button>
            )}
          </Group>
        </Group>
      </div>
    </section>
  );
}
