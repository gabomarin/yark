import { Button, Group, Text } from "@mantine/core";
import type { MaintenancePolicyStatus } from "@shared/types";
import type { ReactElement } from "react";
import { DAY_LABELS } from "../../model/maintenancePanelModel";
import classes from "../../MaintenancePanel.module.css";

interface Props {
  policy: MaintenancePolicyStatus;
}

/** Up next hero — empty or armed summary (#486). */
export function MaintenanceUpNext(props: Props): ReactElement {
  const armed =
    props.policy.restartEnabled ||
    props.policy.wipeEnabled ||
    props.policy.updateEnabled;

  if (!armed) {
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

  const policy = props.policy;
  const day = DAY_LABELS[policy.restartDayOfWeek] ?? "Sunday";
  const title = policy.restartEnabled
    ? policy.restartCadence === "daily"
      ? `Restart · Daily ${policy.restartTimeLocal}`
      : `Restart · ${day} ${policy.restartTimeLocal}`
    : policy.updateEnabled
      ? "Waiting for a new Ark server update"
      : "Wild dino wipe";
  const subtitle = policy.restartEnabled
    ? `Local time · players warned before stop${
        policy.wipeEnabled ? " · then wipe wild dinos" : ""
      }`
    : policy.updateEnabled
      ? "Starts when a new Ark server update is available. Restart schedule not required."
      : "Needs a restart schedule — wipe runs when that restart finishes";

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
            {policy.restartEnabled && (
              <Text size="xs" c="dimmed" mt={4}>
                Last restart · —
              </Text>
            )}
          </div>
          {policy.restartEnabled && (
            <Button
              size="xs"
              disabled
              title="Run now arrives with timed restart warnings"
            >
              Run restart now
            </Button>
          )}
        </Group>
      </div>
    </section>
  );
}
