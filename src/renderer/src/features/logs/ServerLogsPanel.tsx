import { ClockCounterClockwise, DownloadSimple } from "@phosphor-icons/react";
import { Button, Group, Stack, Tabs, Text, Title } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import type { ReactElement } from "react";
import { useUiDensity } from "@app/AppProviders";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { WorkspaceSectionHeader } from "@ui/WorkspaceSectionHeader/WorkspaceSectionHeader";
import { LogsBackupsTab } from "./components/LogsBackupsTab/LogsBackupsTab";
import { LogsEventsTab } from "./components/LogsEventsTab/LogsEventsTab";
import { LogsClearAction } from "./components/LogsPanelChrome/LogsPanelChrome";
import { LogsUpdatesTab } from "./components/LogsUpdatesTab/LogsUpdatesTab";
import classes from "./LogsPage.module.css";
import { RuntimeLogSection } from "./RuntimeLogSection";
import { useServerLogsPanel, type LogsSection, type ServerLogsFocus } from "./hooks/useServerLogsPanel";

export type { ServerLogsFocus } from "./hooks/useServerLogsPanel";

export const BACKUP_HISTORY_TAB_LABEL = "Backup history";

interface Props {
  server: ServerProfile;
  embedded?: boolean;
  focus?: ServerLogsFocus | null;
  /** Called after focus has been applied (so parent can clear one-shot focus). */
  onFocusConsumed?: () => void;
  /** Workspace only — jump to create/restore on the Backups tab. */
  onOpenBackupsTab?: () => void;
  /** True while Ark Server API inject delays ShooterGame.log (#243). */
  asaApiLoading?: boolean;
}

export function ServerLogsPanel(props: Props): ReactElement {
  const panel = useServerLogsPanel({
    server: props.server,
    focus: props.focus,
    onFocusConsumed: props.onFocusConsumed,
  });
  const embedded = props.embedded === true;
  const density = useUiDensity();
  const inputSize = density === "compact" ? "xs" : "sm";
  const rootClass = embedded ? classes.embedded : classes.logsContent;
  const actions = (
    <>
      <Button
        size={inputSize}
        variant="default"
        leftSection={<ClockCounterClockwise size={16} />}
        onClick={() => void panel.load(props.server.id)}
        disabled={panel.loading || panel.busy}
      >
        Reload
      </Button>
      <Button
        size={inputSize}
        leftSection={<DownloadSimple size={16} />}
        onClick={() => void panel.exportLogs()}
        disabled={panel.loading || panel.busy}
      >
        Export
      </Button>
    </>
  );

  const tabs = (
    <Tabs
      value={panel.activeSection}
      onChange={(value) => panel.setActiveSection((value as LogsSection) ?? "events")}
      keepMounted={false}
      className={classes.tabs}
    >
      <Tabs.List className={classes.tabList}>
        <Tabs.Tab value="events">Events</Tabs.Tab>
        <Tabs.Tab value="runtime">Runtime</Tabs.Tab>
        <Tabs.Tab value="updates">Updates</Tabs.Tab>
        <Tabs.Tab value="backups">{BACKUP_HISTORY_TAB_LABEL}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="events" className={classes.tabPanel}>
        <LogsEventsTab
          embedded={embedded}
          loading={panel.loading}
          busy={panel.busy}
          logs={panel.logs}
          highlightedEventId={panel.highlightedEventId}
          expandedEventId={panel.expandedEventId}
          onExpandedEventIdChange={panel.setExpandedEventId}
          onClearEvents={panel.confirmClearEvents}
        />
      </Tabs.Panel>

      <Tabs.Panel value="runtime" className={classes.tabPanel}>
        <RuntimeLogSection
          loading={panel.loading}
          runtimeLogLines={panel.logs?.runtimeLogLines ?? null}
          sourceFilter={panel.runtimeSourceFilter}
          onSourceFilterChange={panel.setRuntimeSourceFilter}
          asaApiLoading={props.asaApiLoading === true}
          clearAction={
            <LogsClearAction
              label="Clear captured runtime console output"
              onClick={panel.confirmClearRuntime}
              disabled={panel.loading || panel.busy || panel.logs === null || panel.logs.runtimeLogLines.length === 0}
            />
          }
        />
      </Tabs.Panel>

      <Tabs.Panel value="updates" className={classes.tabPanel}>
        <LogsUpdatesTab
          embedded={embedded}
          loading={panel.loading}
          busy={panel.busy}
          logs={panel.logs}
          serverId={props.server.id}
          selectedUpdateFile={panel.selectedUpdateFile}
          updateContent={panel.updateContent}
          missingUpdateLog={panel.missingUpdateLog}
          selectedUpdateInfo={panel.selectedUpdateInfo}
          onOpenUpdateLog={(serverId, fileName) => void panel.openUpdateLog(serverId, fileName)}
          onClearUpdateLogs={panel.confirmClearUpdateLogs}
          onOpenInExternalViewer={() => void panel.openInExternalViewer()}
          onDeleteSelectedUpdate={panel.confirmDeleteSelectedUpdate}
        />
      </Tabs.Panel>

      <Tabs.Panel value="backups" className={classes.tabPanel}>
        <LogsBackupsTab
          embedded={embedded}
          loading={panel.loading}
          busy={panel.busy}
          logs={panel.logs}
          highlightedBackupId={panel.highlightedBackupId}
          onClearBackups={panel.confirmClearBackups}
          onDeleteBackup={panel.confirmDeleteBackup}
          onOpenBackupsTab={props.onOpenBackupsTab}
        />
      </Tabs.Panel>
    </Tabs>
  );

  if (!embedded) {
    return (
      <Stack gap="md" className={rootClass} data-server-logs-panel>
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Title order={3}>Logs</Title>
            <Text size="xs" c="dimmed">
              {`Diagnostic views for ${props.server.name}. Use Events for manager history, Runtime for live console output, Updates for SteamCMD jobs, and Backup history for archive records.`}
            </Text>
          </div>
          <Group gap="xs">{actions}</Group>
        </Group>
        {tabs}
      </Stack>
    );
  }

  return (
    <AppSurfaceCard tone="flat" fill padding={0} radius={0} className={classes.embeddedShell} data-server-logs-panel>
      <WorkspaceSectionHeader
        title="Logs"
        subtitle="Events, runtime console, SteamCMD jobs, and backup archive history for this server."
        actions={actions}
      />
      <Stack gap="md" className={rootClass}>
        {tabs}
      </Stack>
    </AppSurfaceCard>
  );
}
