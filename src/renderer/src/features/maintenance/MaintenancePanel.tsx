import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import type { ReactElement } from "react";
import {
  MaintenanceRestartSection,
  MaintenanceUpdateSection,
} from "./components/MaintenanceJobSections/MaintenanceJobSections";
import { MaintenanceUpNext } from "./components/MaintenanceUpNext/MaintenanceUpNext";
import { useMaintenancePanel } from "./hooks/useMaintenancePanel";
import {
  MAINTENANCE_RUN_RESTART_NOW_HINT,
  maintenanceRunRestartNowGate,
} from "./model/maintenancePanelModel";
import classes from "./MaintenancePanel.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  filesJobActive: boolean;
  startBusy?: boolean;
}

/**
 * Workspace Maintenance tab (#486–#489) — Up next + job rows.
 */
export function MaintenancePanel(props: Props): ReactElement {
  const panel = useMaintenancePanel(props.server.id);
  const policy = panel.policy;
  const status = props.runtime?.status ?? "stopped";
  const runRestartGate = maintenanceRunRestartNowGate({
    status,
    enabled: props.server.enabled,
    filesJobActive: props.filesJobActive,
    installation: props.installation,
    startBusy: props.startBusy,
  });

  return (
    <Stack gap="sm" className={classes.panel} data-maintenance-panel>
      <Text className={classes.honesty} size="xs">
        Jobs run only while YARK is open (tray is fine). Everything defaults off.
      </Text>

      {panel.error !== null && (
        <Alert className={classes.alert} color="red" title="Maintenance">
          {panel.error}
        </Alert>
      )}

      {policy?.schedulePaused === true && (
        <Alert
          className={classes.alert}
          color="red"
          title="Paused after repeated failures"
        >
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
          runRestartNowDisabled={!runRestartGate.allowed}
          runRestartNowTooltip={
            runRestartGate.allowed
              ? MAINTENANCE_RUN_RESTART_NOW_HINT
              : runRestartGate.reason
          }
          onRunRestartNow={panel.runRestartNow}
          onRunUpdateNow={panel.runUpdateNow}
          onCancelUpcoming={() => void panel.cancelUpcoming()}
          patch={panel.patch}
          onWipeEnable={() => panel.setRestartOpen(true)}
        />
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
