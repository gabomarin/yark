import type { ReactElement } from "react";
import { HardDrives } from "@phosphor-icons/react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import type { ServerProfile } from "@shared/types";
import {
  BackupFleetAlertsPanel,
  type OpenFailedBackupLogsArgs,
} from "./components/BackupFleetAlertsPanel/BackupFleetAlertsPanel";
import { BackupFleetMetrics } from "./components/BackupFleetMetrics/BackupFleetMetrics";
import { BackupCleanupModal } from "./components/BackupCleanupModal/BackupCleanupModal";
import { BackupDiskAlertModal } from "./components/BackupDiskAlertModal/BackupDiskAlertModal";
import { BackupVolumeStrip } from "./components/BackupVolumeStrip/BackupVolumeStrip";
import { BackupsPageServerSection } from "./components/BackupsPageServerSection/BackupsPageServerSection";
import { useBackupsPageFleet } from "./useBackupsPageFleet";
import classes from "./BackupsPage.module.css";

interface Props {
  servers: ServerProfile[];
  onOpenServerBackups: (serverId: string) => void;
  onOpenFailedBackupLogs?: (args: OpenFailedBackupLogsArgs) => void;
}

export function BackupsPage(props: Props): ReactElement {
  const fleet = useBackupsPageFleet(props.servers);

  return (
    <PageScaffold
      title="Backups"
      fillViewport
      actions={
        <Group gap="sm">
          <Button
            variant="default"
            onClick={() => void fleet.load({ forceDraftSync: true })}
            loading={fleet.loading}
          >
            Refresh
          </Button>
          <Button
            variant="light"
            disabled={props.servers.length === 0}
            onClick={fleet.openCleanupModalFromToolbar}
          >
            Cleanup…
          </Button>
        </Group>
      }
    >
      <Stack gap="md" className={classes.content}>
        {props.servers.length === 0 ? (
          <AppSurfaceCard>
            <EmptyState
              icon={<HardDrives size={22} />}
              title="No servers yet"
              description="Create a server first to configure backups."
            />
          </AppSurfaceCard>
        ) : fleet.loading && fleet.summary === null ? (
          <AppSurfaceCard>
            <Text c="dimmed">Loading backup health…</Text>
          </AppSurfaceCard>
        ) : fleet.summary !== null ? (
          <>
            <BackupFleetAlertsPanel
              alerts={fleet.summary.alerts}
              onOpenServerBackups={props.onOpenServerBackups}
              onOpenFailedBackupLogs={props.onOpenFailedBackupLogs}
              onDismissAlert={(alert) => void fleet.dismissFleetAlert(alert)}
              onOpenCleanup={fleet.openCleanupModal}
            />

            <BackupFleetMetrics
              summary={fleet.summary}
              quiet={fleet.backupFleetQuiet}
              healthFilter={fleet.healthFilter}
              onHealthFilter={fleet.setHealthFilter}
              onOpenDiskSettings={() => {
                fleet.setDiskDraft(fleet.summary!.diskSettings);
                fleet.setDiskModalOpen(true);
              }}
            />

            {fleet.summary.disks.length > 0 && !fleet.backupFleetQuiet && (
              <BackupVolumeStrip
                disks={fleet.summary.disks}
                diskSettings={fleet.summary.diskSettings}
              />
            )}

            <BackupsPageServerSection
              filteredServers={fleet.filteredServers}
              drafts={fleet.drafts}
              expandedId={fleet.expandedId}
              busyId={fleet.busyId}
              browsingId={fleet.browsingId}
              healthFilter={fleet.healthFilter}
              onHealthFilter={fleet.setHealthFilter}
              serverById={fleet.serverById}
              onToggleExpand={(serverId) =>
                fleet.setExpandedId(
                  fleet.expandedId === serverId ? null : serverId,
                )
              }
              onOpenDestination={(serverId) => void fleet.openDestination(serverId)}
              onOpenServer={props.onOpenServerBackups}
              onBrowse={(server) => void fleet.browseBackupDir(server)}
              onDraftChange={(serverId, next) =>
                fleet.setDrafts((previous) => ({
                  ...previous,
                  [serverId]: next,
                }))
              }
              onSave={(serverId) => void fleet.savePolicy(serverId)}
            />
          </>
        ) : null}
      </Stack>

      <BackupDiskAlertModal
        opened={fleet.diskModalOpen}
        onClose={() => fleet.setDiskModalOpen(false)}
        diskDraft={fleet.diskDraft}
        onDiskDraftChange={fleet.setDiskDraft}
        busy={fleet.diskBusy}
        onSave={() => void fleet.saveDiskSettings()}
      />

      <BackupCleanupModal
        opened={fleet.cleanupOpen}
        busy={fleet.cleanupBusy}
        onClose={() => fleet.setCleanupOpen(false)}
        cleanupOptions={fleet.cleanupOptions}
        onCleanupOptionsChange={fleet.setCleanupOptions}
        olderThanEnabled={fleet.olderThanEnabled}
        onOlderThanEnabledChange={fleet.setOlderThanEnabled}
        olderThanDays={fleet.olderThanDays}
        onOlderThanDaysChange={fleet.setOlderThanDays}
        keepLastEnabled={fleet.keepLastEnabled}
        onKeepLastEnabledChange={fleet.setKeepLastEnabled}
        keepLastPerKind={fleet.keepLastPerKind}
        onKeepLastPerKindChange={fleet.setKeepLastPerKind}
        cleanupPreview={fleet.cleanupPreview}
        onClearPreview={fleet.clearCleanupPreview}
        onPreview={() => void fleet.runPreviewCleanup()}
        onConfirm={() => void fleet.confirmCleanup()}
      />
    </PageScaffold>
  );
}
