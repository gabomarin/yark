import { Group, Stack, Switch, Text } from "@mantine/core";
import type { MaintenancePolicyStatus } from "@shared/types";
import type { ReactElement } from "react";
import { MaintenancePlayerWarnings } from "../MaintenancePlayerWarnings/MaintenancePlayerWarnings";
import classes from "../../MaintenancePanel.module.css";

type PatchFn = (
  partial: Partial<
    Omit<MaintenancePolicyStatus, "serverId" | "updatedAt" | "schedulePaused">
  >,
) => Promise<boolean>;

interface Props {
  policy: MaintenancePolicyStatus;
  busy: boolean;
  open: boolean;
  /** Live server-status push may arrive before the policy panel's next poll. */
  manualRestartPending?: boolean;
  onToggleOpen: () => void;
  onOpen: () => void;
  patch: PatchFn;
}

/**
 * Manual restart player warning (#573): own toggle + short fixed cadence
 * presets, separate from the longer scheduled restart warning policy.
 */
export function MaintenanceManualRestartSection(props: Props): ReactElement {
  const { policy } = props;
  const restartPending =
    props.manualRestartPending === true || policy.countdownKind === "manual";
  const controlsDisabled = props.busy || restartPending;

  return (
    <section className={classes.slab} style={{ marginTop: -1 }}>
      <div className={classes.slabHeader}>
        <button
          type="button"
          className={classes.slabHeaderToggle}
          aria-expanded={props.open}
          onClick={props.onToggleOpen}
        >
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
              className={`${classes.chevron}${props.open ? ` ${classes.chevronOpen}` : ""}`}
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
            <div>
              <Text size="sm" fw={600}>
                Manual restart warnings
              </Text>
              <Text size="xs" c="dimmed">
                {policy.manualRestartWarningsEnabled
                  ? "Warn players before a manual restart"
                  : "Off — Restart button restarts immediately"}
              </Text>
            </div>
          </Group>
        </button>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {policy.manualRestartWarningsEnabled ? "On" : "Off"}
          </Text>
          <Switch
            size="sm"
            checked={policy.manualRestartWarningsEnabled}
            disabled={controlsDisabled}
            aria-label="Enable manual restart warnings"
            onChange={(e) => {
              const on = e.currentTarget.checked;
              void props
                .patch({ manualRestartWarningsEnabled: on })
                .then((ok) => {
                  if (ok && on) props.onOpen();
                });
            }}
          />
        </Group>
      </div>
      {props.open && (
        <div className={classes.slabBody}>
          <Stack gap="sm">
            {restartPending && (
              <Text size="xs" c="attention">
                Manual restart is queued. Finish or cancel it before changing
                these warning settings.
              </Text>
            )}
            {!policy.manualRestartWarningsEnabled && (
              <Text size="xs" c="dimmed">
                Turn On to add “Restart with player warning” to the Restart button
                on Overview and the workspace. Choose a short warning cadence below.
              </Text>
            )}
            <MaintenancePlayerWarnings
              kind="manual"
              warnings={policy.manualRestartWarnings}
              disabled={
                controlsDisabled || !policy.manualRestartWarningsEnabled
              }
              onChange={(manualRestartWarnings) => {
                void props.patch({ manualRestartWarnings });
              }}
            />
          </Stack>
        </div>
      )}
    </section>
  );
}
