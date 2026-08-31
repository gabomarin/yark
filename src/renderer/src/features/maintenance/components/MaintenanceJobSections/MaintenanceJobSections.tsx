import {
  Group,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import type { MaintenancePolicyStatus } from "@shared/types";
import type { ReactElement } from "react";
import { MaintenancePlayerWarnings } from "../MaintenancePlayerWarnings/MaintenancePlayerWarnings";
import { MaintenanceRestartSchedule } from "../MaintenanceRestartSchedule/MaintenanceRestartSchedule";
import {
  formatRestartSummary,
  formatUpdateSummary,
} from "../../model/maintenancePanelModel";
import classes from "../../MaintenancePanel.module.css";

function Chevron({ open }: { open: boolean }): ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={`${classes.chevron}${open ? ` ${classes.chevronOpen}` : ""}`}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

type PatchFn = (
  partial: Partial<
    Omit<MaintenancePolicyStatus, "serverId" | "updatedAt" | "schedulePaused">
  >,
) => Promise<boolean>;

interface SharedProps {
  policy: MaintenancePolicyStatus;
  busy: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onOpen: () => void;
  patch: PatchFn;
}

export function MaintenanceRestartSection(props: SharedProps): ReactElement {
  const { policy } = props;
  const controlsDisabled = props.busy || !policy.restartEnabled;

  return (
    <section className={classes.slab}>
      <button
        type="button"
        className={classes.slabHeader}
        aria-expanded={props.open}
        onClick={props.onToggleOpen}
      >
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <Chevron open={props.open} />
          <div>
            <Text size="sm" fw={600}>
              Restart schedule
            </Text>
            <Text size="xs" c="dimmed">
              {policy.restartEnabled ? formatRestartSummary(policy) : "Off"}
            </Text>
          </div>
        </Group>
        <Group gap="xs" onClick={(e) => e.stopPropagation()}>
          <Text size="xs" c="dimmed">
            {policy.restartEnabled ? "On" : "Off"}
          </Text>
          <Switch
            size="sm"
            checked={policy.restartEnabled}
            disabled={props.busy}
            aria-label="Enable restart schedule"
            onChange={(e) => {
              const on = e.currentTarget.checked;
              void props
                .patch(
                  on
                    ? { restartEnabled: true }
                    : { restartEnabled: false, wipeEnabled: false },
                )
                .then((ok) => {
                  if (ok && on) props.onOpen();
                });
            }}
          />
        </Group>
      </button>
      {props.open && (
        <div className={classes.slabBody}>
          <Stack gap="sm">
            {!policy.restartEnabled && (
              <Text size="xs" c="dimmed">
                Turn On to use this schedule.
              </Text>
            )}
            <MaintenanceRestartSchedule
              policy={policy}
              disabled={controlsDisabled}
              onPatchDays={(restartDaysOfWeek) => {
                void props.patch({ restartDaysOfWeek });
              }}
              onPatchTime={(restartTimeLocal) => {
                void props.patch({ restartTimeLocal });
              }}
            />
            <MaintenancePlayerWarnings
              kind="restart"
              warnings={policy.restartWarnings}
              disabled={controlsDisabled}
              onChange={(restartWarnings) => {
                void props.patch({ restartWarnings });
              }}
            />
          </Stack>
        </div>
      )}
    </section>
  );
}

export function MaintenanceUpdateSection(props: SharedProps): ReactElement {
  const { policy } = props;
  const controlsDisabled = props.busy || !policy.updateEnabled;

  return (
    <section className={classes.slab} style={{ marginTop: -1 }}>
      <button
        type="button"
        className={classes.slabHeader}
        aria-expanded={props.open}
        onClick={props.onToggleOpen}
      >
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <Chevron open={props.open} />
          <div>
            <Text size="sm" fw={600}>
              Auto-update
            </Text>
            <Text size="xs" c="dimmed">
              {formatUpdateSummary(policy)}
            </Text>
          </div>
        </Group>
        <Group gap="xs" onClick={(e) => e.stopPropagation()}>
          <Text size="xs" c="dimmed">
            {policy.updateEnabled ? "On" : "Off"}
          </Text>
          <Switch
            size="sm"
            checked={policy.updateEnabled}
            disabled={props.busy}
            aria-label="Enable auto-update"
            onChange={(e) => {
              const on = e.currentTarget.checked;
              void props.patch({ updateEnabled: on }).then((ok) => {
                if (ok && on) props.onOpen();
              });
            }}
          />
        </Group>
      </button>
      {props.open && (
        <div className={classes.slabBody}>
          <Stack gap="sm">
            {!policy.updateEnabled && (
              <Text size="xs" c="dimmed">
                Turn On to use auto-update.
              </Text>
            )}
            <MaintenancePlayerWarnings
              kind="update"
              warnings={policy.updateWarnings}
              disabled={controlsDisabled}
              onChange={(updateWarnings) => {
                void props.patch({ updateWarnings });
              }}
            />
          </Stack>
        </div>
      )}
    </section>
  );
}
