import { Alert, Group, Stack, Tabs, Text, Title } from "@mantine/core";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { ReactElement } from "react";
import { BackupHistoryTable } from "./BackupHistoryTable";
import { BackupRestoreModal } from "./BackupRestoreModal";
import classes from "./BackupsPage.module.css";
import { BackupKindSettings } from "./components/BackupKindSettings/BackupKindSettings";
import { BackupListToolbar } from "./components/BackupListToolbar/BackupListToolbar";
import { ServerBackupHeader } from "./components/ServerBackupHeader/ServerBackupHeader";
import { ServerBackupMetrics } from "./components/ServerBackupMetrics/ServerBackupMetrics";
import {
  formatRelativeTime,
  formatSize,
  KIND_TABS,
} from "./model/serverBackupPanelModel";
import { useServerBackupPanel } from "./hooks/useServerBackupPanel";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation?: ServerInstallationInfo | null;
  embedded?: boolean;
  opsLocked?: boolean;
  opsLockReason?: string;
  createLocked?: boolean;
  createLockReason?: string;
}

export function ServerBackupPanel(props: Props): ReactElement {
  const panel = useServerBackupPanel(props);
  const embedded = props.embedded === true;
  const showManualCreate = panel.activeKind !== "players";
  const createTooltip = panel.createBlocked
    ? panel.createBlockReason
    : panel.activeKind === "world"
      ? "Create a manual world save backup now"
      : "Create a manual backup of Game.ini and GameUserSettings.ini";
  const deleteTooltip =
    panel.actionableSelectedIds.length === 0
      ? "Select backups to delete"
      : `Permanently delete ${panel.actionableSelectedIds.length} selected backup${panel.actionableSelectedIds.length === 1 ? "" : "s"}`;
  const createLoading = panel.busyOp === "create";
  const createDisabled =
    panel.loading || panel.createBlocked || (panel.busy && !createLoading);

  return (
    <Stack gap="md" className={embedded ? classes.embedded : undefined}>
      {embedded ? (
        <ServerBackupHeader
          title="Backups"
          subtitle="World schedule is separate from player join/leave and INI-on-save backups."
          showManualCreate={showManualCreate}
          createBlocked={panel.createBlocked}
          createTooltip={createTooltip}
          createLoading={createLoading}
          createDisabled={createDisabled}
          onCreate={() => void panel.createBackup()}
        />
      ) : (
        <Group justify="space-between" wrap="wrap" gap="sm" align="flex-end">
          <div>
            <Title order={3}>Backups for {props.server.name}</Title>
            <Text size="sm" c="dimmed">
              World schedule is separate from player join/leave and INI-on-save backups.
            </Text>
          </div>
        </Group>
      )}

      {embedded && <ServerBackupMetrics metrics={panel.metricStrip} />}

      {!panel.installReady && (
        <Alert
          color="yellow"
          variant="light"
          title="Install files required"
          data-backup-install-lock
        >
          {panel.installLockReason} You can still browse, export, import, and delete
          archived backups.
        </Alert>
      )}

      {panel.policy?.schedulePaused === true && (
        <Alert
          color="red"
          variant="light"
          title="World schedule paused"
          data-backup-schedule-paused
        >
          Scheduled world backups are paused for this YARK session after repeated
          failures. Policy stays enabled; restart YARK to resume after fixing the
          cause (destination, map folder, or disk space).
        </Alert>
      )}

      <AppSurfaceCard className={classes.listPanel}>
        <Tabs
          value={panel.activeKind}
          onChange={(value) => {
            if (value === "world" || value === "players" || value === "ini") {
              panel.selectKind(value);
            }
          }}
          className={classes.kindTabs}
        >
          <Tabs.List className={classes.kindTabList}>
            {KIND_TABS.map((tab) => (
              <Tabs.Tab key={tab.kind} value={tab.kind}>
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Stack gap="sm" className={classes.listStack}>
            {panel.draftPolicy !== null && (
              <BackupKindSettings
                draftPolicy={panel.draftPolicy}
                activeKind={panel.activeKind}
                settingsOpen={panel.settingsOpen}
                onSettingsOpenChange={panel.setSettingsOpen}
                settingsTitle={panel.settingsTitle}
                settingsSummary={panel.settingsSummary}
                defaultBackupHint={panel.defaultBackupHint}
                resolvedRoot={panel.resolvedRoot}
                busy={panel.busy}
                installReady={panel.installReady}
                browsingDir={panel.browsingDir}
                onDraftPolicyChange={panel.setDraftPolicy}
                onBrowseBackupDir={() => void panel.browseBackupDir()}
                onOpenDestination={() => void panel.openDestination()}
              />
            )}

            <BackupListToolbar
              activeKind={panel.activeKind}
              activeKindLabel={panel.activeKindLabel}
              serverMap={props.server.map}
              kindBackups={panel.kindBackups}
              currentMapOnly={panel.currentMapOnly}
              onCurrentMapOnlyChange={panel.setCurrentMapOnly}
              playerSearch={panel.playerSearch}
              onPlayerSearchChange={panel.setPlayerSearch}
              opsLocked={panel.opsLocked}
              installReady={panel.installReady}
              opsLockReason={panel.opsLockReason}
              createLocked={props.createLocked}
              refreshing={panel.refreshing}
              loading={panel.loading}
              busy={panel.busy}
              busyOp={panel.busyOp}
              showImport={showManualCreate}
              showManualCreate={showManualCreate && !embedded}
              createBlocked={panel.createBlocked}
              createTooltip={createTooltip}
              createLabel="Backup"
              deleteTooltip={deleteTooltip}
              actionableSelectedCount={panel.actionableSelectedIds.length}
              onRefresh={() => void panel.forceRefresh()}
              onImport={() => void panel.importBackup()}
              onCreate={() => void panel.createBackup()}
              onDeleteSelected={panel.confirmDeleteSelected}
              onClearFailed={panel.confirmClearFailed}
            />

            <div className={classes.listScroll} data-backup-list>
              <BackupHistoryTable
                key={panel.activeKind}
                kind={panel.activeKind}
                records={panel.displayedBackups}
                selectedIds={panel.selectedIds}
                busy={panel.busy}
                opsLocked={panel.opsLocked}
                fetching={panel.loading && panel.kindBackups.length === 0}
                emptyHint={panel.emptyHint}
                onSelectedIdsChange={panel.setSelectedIds}
                onCopyDetails={(row) => void panel.copyBackupDetails(row)}
                onOpenFolder={(id) => void panel.openBackupFolder(id)}
                onExport={(row) => void panel.exportBackup(row)}
                onRestore={panel.confirmRestore}
                onDelete={panel.confirmDeleteOne}
                formatSize={formatSize}
                formatRelativeTime={formatRelativeTime}
              />
            </div>
          </Stack>
        </Tabs>
      </AppSurfaceCard>

      <BackupRestoreModal
        backup={panel.restoreTarget}
        serverName={props.server.name}
        serverMap={props.server.map}
        restoreProfilesTribes={panel.restoreProfilesTribes}
        busy={panel.busyOp === "other"}
        onRestoreProfilesTribesChange={panel.setRestoreProfilesTribes}
        onClose={panel.closeRestoreModal}
        onConfirm={() => void panel.runRestore()}
      />
    </Stack>
  );
}
