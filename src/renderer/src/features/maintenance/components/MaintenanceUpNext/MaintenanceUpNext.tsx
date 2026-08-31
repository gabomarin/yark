import { Button, Group, Stack, Switch, Text, Tooltip } from "@mantine/core";
import type { MaintenancePolicyStatus } from "@shared/types";
import type { ReactElement } from "react";
import { formatRestartDaysSummary, formatMaintenanceLocalDateTime, PRESET_LABELS, AUTO_UPDATE_TRIGGER_COPY, formatRestartUpNextSubtitle } from "../../model/maintenancePanelModel";
import classes from "../../MaintenancePanel.module.css";

type PatchFn = (
  partial: Partial<
    Omit<MaintenancePolicyStatus, "serverId" | "updatedAt" | "schedulePaused">
  >,
) => Promise<boolean>;

interface Props {
  policy: MaintenancePolicyStatus;
  busy: boolean;
  runRestartNowDisabled: boolean;
  runRestartNowTooltip: string;
  onRunRestartNow: () => void;
  onRunUpdateNow: () => void;
  onCancelUpcoming: () => void;
  patch: PatchFn;
  onWipeEnable: () => void;
}

function MaintenanceWipeToggle(props: {
  policy: MaintenancePolicyStatus;
  busy: boolean;
  patch: PatchFn;
  onWipeEnable: () => void;
}): ReactElement {
  const { policy } = props;
  const subtitle = policy.wipeEnabled
    ? "After scheduled restart"
    : "Off · does not remove tames or structures";

  return (
    <div className={classes.nestedRow}>
      <div>
        <Text size="sm" fw={600}>
          Wild dino wipe
        </Text>
        <Text size="xs" c="dimmed">
          {subtitle}
        </Text>
      </div>
      <Group gap="xs" wrap="nowrap">
        <Text size="xs" c="dimmed">
          {policy.wipeEnabled ? "On" : "Off"}
        </Text>
        <Switch
          size="sm"
          checked={policy.wipeEnabled}
          disabled={props.busy}
          aria-label="Enable wild dino wipe"
          onChange={(e) => {
            const on = e.currentTarget.checked;
            void props
              .patch({
                wipeEnabled: on,
                restartEnabled: on ? true : policy.restartEnabled,
              })
              .then((ok) => {
                if (ok && on) props.onWipeEnable();
              });
          }}
        />
      </Group>
    </div>
  );
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

  const daysLabel = formatRestartDaysSummary(policy.restartDaysOfWeek);

  const wipeToggle = (
    <MaintenanceWipeToggle
      policy={policy}
      busy={props.busy}
      patch={props.patch}
      onWipeEnable={props.onWipeEnable}
    />
  );

  if (!armed && !live) {
    return (
      <section className={classes.slab} data-maintenance-up-next>
        <Stack gap="sm" className={classes.upNextBody}>
          <div>
            <Text className={classes.upNextLabel}>Up next</Text>
            <h2 className={classes.upNextTitle}>Nothing scheduled</h2>
            <Text size="sm" c="dimmed" mt={4} maw={480}>
              Turn on a job below. Restart and wipe share one weekly window;
              auto-update runs on its own when a new Ark server update is out.
            </Text>
          </div>
          {wipeToggle}
        </Stack>
      </section>
    );
  }

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
    title = `Restart · ${daysLabel} ${policy.restartTimeLocal}`;
    subtitle = formatRestartUpNextSubtitle(policy);
  } else if (policy.updateEnabled) {
    const { preset } = policy.updateWarnings;
    const presetTitle =
      preset === "none"
        ? "no warnings"
        : preset === "custom"
          ? "your warning times"
          : `${PRESET_LABELS[preset].title} warnings`;
    title = `Auto-update · ${presetTitle}`;
    subtitle = `Runs ${AUTO_UPDATE_TRIGGER_COPY}`;
  } else {
    title = "Wild dino wipe";
    subtitle = "Needs a restart schedule — wipe runs when that restart finishes";
  }

  const lastRestartLine =
    policy.lastRestartAt !== null
      ? `Last restart · ${policy.lastRestartOk === false ? "failed" : "OK"} · ${formatMaintenanceLocalDateTime(
          policy.lastRestartAt,
        )}`
      : policy.restartEnabled
        ? "Last restart · —"
        : null;
  const lastUpdateLine =
    policy.updateEnabled && policy.lastUpdateAt !== null
      ? `Last auto-update · ${policy.lastUpdateOk === false ? "failed" : "OK"} · ${formatMaintenanceLocalDateTime(
          policy.lastUpdateAt,
        )}`
      : null;

  return (
    <section className={classes.slab} data-maintenance-up-next>
      <Stack gap="sm" className={classes.upNextBody}>
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
                size="compact-sm"
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
              <Tooltip label={props.runRestartNowTooltip} withArrow>
                <span>
                  <Button
                    size="compact-sm"
                    loading={props.busy}
                    disabled={props.runRestartNowDisabled}
                    onClick={props.onRunRestartNow}
                  >
                    Run scheduled restart now
                  </Button>
                </span>
              </Tooltip>
            )}
            {policy.updateEnabled
              && !live
              && policy.countdownPhase === "idle" && (
              <Tooltip
                label={
                  policy.steamUpdateAvailable
                    ? "Warn players, then run YARK's safe update"
                    : "No new Ark server version available yet"
                }
                withArrow
              >
                <span>
                  <Button
                    size="compact-sm"
                    variant="light"
                    loading={props.busy}
                    disabled={!policy.steamUpdateAvailable}
                    onClick={props.onRunUpdateNow}
                  >
                    Run update now
                  </Button>
                </span>
              </Tooltip>
            )}
          </Group>
        </Group>
        {wipeToggle}
      </Stack>
    </section>
  );
}
