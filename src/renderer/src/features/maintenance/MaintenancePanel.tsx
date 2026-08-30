import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import type { ReactElement } from "react";
import {
  MaintenanceRestartSection,
  MaintenanceUpdateSection,
  MaintenanceWipeSection,
} from "./components/MaintenanceJobSections/MaintenanceJobSections";
import { MaintenanceUpNext } from "./components/MaintenanceUpNext/MaintenanceUpNext";
import { useMaintenancePanel } from "./hooks/useMaintenancePanel";
import classes from "./MaintenancePanel.module.css";

interface Props {
  server: ServerProfile;
}

/**
 * Workspace Maintenance tab (#486 / #487 / #489) — Up next + job rows.
 * Wipe-after-restart lands in #488 when merged.
 */
export function MaintenancePanel(props: Props): ReactElement {
  const panel = useMaintenancePanel(props.server.id);
  const policy = panel.policy;

  return (
    <Stack gap="sm" className={classes.panel} data-maintenance-panel>
      <Text className={classes.honesty} size="xs">
        Jobs run only while YARK is open (tray is fine). Everything defaults off.
      </Text>

      {panel.error !== null && (
        <Alert color="red" title="Maintenance">
          {panel.error}
        </Alert>
      )}

      {policy?.schedulePaused === true && (
        <Alert color="red" title="Paused after repeated failures">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
            <Text size="sm" c="dimmed">
              Automatic runs are paused for this YARK session. Policy stays
              enabled — resume when ready.
            </Text>
            <Button
              size="xs"
              variant="light"
              color="red"
              loading={panel.busy}
              onClick={() => void panel.resumeSchedules()}
            >
              Resume schedules
            </Button>
          </Group>
        </Alert>
      )}

      {policy !== null && (
        <MaintenanceUpNext
          policy={policy}
          busy={panel.busy}
          onRunRestartNow={panel.runRestartNow}
          onRunUpdateNow={panel.runUpdateNow}
          onCancelUpcoming={() => void panel.cancelUpcoming()}
        />
      )}

      {policy !== null && policy.wipeEnabled && (
        <Text size="xs" c="dimmed" pl={4}>
          · Wipe wild dinos after restart
        </Text>
      )}

      {policy !== null && (
        <>
          <MaintenanceRestartSection
            policy={policy}
            busy={panel.busy}
            open={panel.restartOpen}
            onToggleOpen={() => panel.setRestartOpen((v) => !v)}
            onOpen={() => panel.setRestartOpen(true)}
            patch={panel.patch}
          />
          <MaintenanceWipeSection
            policy={policy}
            busy={panel.busy}
            open={panel.wipeOpen}
            onToggleOpen={() => panel.setWipeOpen((v) => !v)}
            onOpen={() => panel.setWipeOpen(true)}
            patch={panel.patch}
          />
          <MaintenanceUpdateSection
            policy={policy}
            busy={panel.busy}
            open={panel.updateOpen}
            onToggleOpen={() => panel.setUpdateOpen((v) => !v)}
            onOpen={() => panel.setUpdateOpen(true)}
            patch={panel.patch}
          />
        </>
      )}
    </Stack>
  );
}
