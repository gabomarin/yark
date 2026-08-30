import {
  Group,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import type { MaintenancePolicyStatus } from "@shared/types";
import type { ReactElement } from "react";
import { MaintenancePlayerWarnings } from "../MaintenancePlayerWarnings/MaintenancePlayerWarnings";
import {
  DAY_LABELS,
  formatRestartSummary,
  PRESET_LABELS,
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
            <Text size="xs" c="dimmed">
              Timed in-game warnings, then a graceful restart with backup before
              the server comes back up.
              {!policy.restartEnabled
                ? " Turn On to use this schedule."
                : ""}
            </Text>
            <Group gap="sm" align="flex-end" wrap="wrap">
              <Select
                size="xs"
                label="When"
                w={140}
                allowDeselect={false}
                data={[
                  { value: "weekly", label: "Every week" },
                  { value: "daily", label: "Every day" },
                ]}
                value={policy.restartCadence}
                disabled={controlsDisabled}
                onChange={(value) => {
                  if (value === "weekly" || value === "daily") {
                    void props.patch({ restartCadence: value });
                  }
                }}
              />
              {policy.restartCadence === "weekly" && (
                <Select
                  size="xs"
                  label="Day"
                  w={140}
                  allowDeselect={false}
                  data={DAY_LABELS.map((label, value) => ({
                    value: String(value),
                    label,
                  }))}
                  value={String(policy.restartDayOfWeek)}
                  disabled={controlsDisabled}
                  onChange={(value) => {
                    if (value === null) return;
                    void props.patch({ restartDayOfWeek: Number(value) });
                  }}
                />
              )}
              <TextInput
                size="xs"
                label="Local time"
                type="time"
                w={140}
                value={policy.restartTimeLocal}
                disabled={controlsDisabled}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  if (/^\d{2}:\d{2}$/.test(v)) {
                    void props.patch({ restartTimeLocal: v });
                  }
                }}
              />
            </Group>
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

export function MaintenanceWipeSection(props: SharedProps): ReactElement {
  const { policy } = props;
  const controlsDisabled = props.busy || !policy.wipeEnabled;

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
              Wild dino wipe
            </Text>
            <Text size="xs" c="dimmed">
              {policy.wipeEnabled
                ? policy.restartEnabled
                  ? "After the scheduled restart finishes · wild only"
                  : "On · needs a restart schedule to run"
                : "Off · does not remove tames or structures"}
            </Text>
          </div>
        </Group>
        <Group gap="xs" onClick={(e) => e.stopPropagation()}>
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
                  if (ok && on) props.onOpen();
                });
            }}
          />
        </Group>
      </button>
      {props.open && (
        <div className={classes.slabBody}>
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              When On, wipe runs automatically after a successful scheduled
              restart.
              {!policy.wipeEnabled ? " Turn On to arm wipe-after-restart." : ""}
            </Text>
            <div className={classes.nestedRow}>
              <div>
                <Text size="sm" fw={500}>
                  Save the world first
                </Text>
                <Text size="xs" c="dimmed">
                  Recommended before wiping
                </Text>
              </div>
              <Switch
                size="sm"
                checked={policy.wipeSaveWorldFirst}
                disabled={controlsDisabled}
                aria-label="Save world before wipe"
                onChange={(e) => {
                  void props.patch({
                    wipeSaveWorldFirst: e.currentTarget.checked,
                  });
                }}
              />
            </div>
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
              {policy.updateEnabled
                ? `${PRESET_LABELS[policy.updateWarnings.preset].title} warnings · when a new Ark update is out`
                : "Off · safe update with rollback · restart schedule not required"}
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
            <Text size="xs" c="dimmed">
              When a new Ark server update is available, warn players and run
              YARK’s usual safe update (backup + rollback). Separate from the
              weekly restart.
            </Text>
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
