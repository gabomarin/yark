import { ClockCounterClockwise, DownloadSimple } from "@phosphor-icons/react";
import { Alert, Button, Group, Stack, Tabs, Text, Title } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import type { ReactElement } from "react";
import { LogsBackupsTab } from "./components/LogsBackupsTab/LogsBackupsTab";
import { LogsEventsTab } from "./components/LogsEventsTab/LogsEventsTab";
import { LogsClearAction } from "./components/LogsPanelChrome/LogsPanelChrome";
import { LogsUpdatesTab } from "./components/LogsUpdatesTab/LogsUpdatesTab";
import classes from "./LogsPage.module.css";
import { RuntimeLogSection } from "./RuntimeLogSection";
import {
  useServerLogsPanel,
  type LogsSection,
  type ServerLogsFocus,
} from "./hooks/useServerLogsPanel";

export type { ServerLogsFocus } from "./hooks/useServerLogsPanel";

interface Props {
  server: ServerProfile;
  embedded?: boolean;
  focus?: ServerLogsFocus | null;
  /** Called after focus has been applied (so parent can clear one-shot focus). */
  onFocusConsumed?: () => void;
}

export function ServerLogsPanel(props: Props): ReactElement {
  const panel = useServerLogsPanel({
    server: props.server,
    focus: props.focus,
    onFocusConsumed: props.onFocusConsumed,
  });
  const rootClass = props.embedded === true ? classes.embedded : classes.logsContent;

  return (
    <Stack gap="md" className={rootClass} data-server-logs-panel>
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <div>
          <Title order={props.embedded === true ? 4 : 3}>Logs</Title>
          <Text size="sm" c="dimmed">
            Diagnostic views for {props.server.name}. Use Events for manager
            history, Runtime for live console output, Updates for SteamCMD jobs,
            and Backups for archive history.
          </Text>
        </div>
        <Group gap="sm">
          <Button
            variant="default"
            leftSection={<ClockCounterClockwise size={16} />}
            onClick={() => void panel.load(props.server.id)}
            disabled={panel.loading || panel.busy}
          >
            Reload
          </Button>
          <Button
            leftSection={<DownloadSimple size={16} />}
            onClick={() => void panel.exportLogs()}
            disabled={panel.loading || panel.busy}
          >
            Export
          </Button>
        </Group>
      </Group>

      {panel.error !== null && <Alert color="red">{panel.error}</Alert>}

      <Tabs
        value={panel.activeSection}
        onChange={(value) =>
          panel.setActiveSection((value as LogsSection) ?? "events")
        }
        keepMounted={false}
        className={classes.tabs}
      >
        <Tabs.List className={classes.tabList}>
          <Tabs.Tab value="events">Events</Tabs.Tab>
          <Tabs.Tab value="runtime">Runtime</Tabs.Tab>
          <Tabs.Tab value="updates">Updates</Tabs.Tab>
          <Tabs.Tab value="backups">Backups</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="events" className={classes.tabPanel}>
          <LogsEventsTab
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
            clearAction={
              <LogsClearAction
                label="Clear captured runtime console output"
                onClick={panel.confirmClearRuntime}
                disabled={
                  panel.loading ||
                  panel.busy ||
                  panel.logs === null ||
                  panel.logs.runtimeLogLines.length === 0
                }
              />
            }
          />
        </Tabs.Panel>

        <Tabs.Panel value="updates" className={classes.tabPanel}>
          <LogsUpdatesTab
            loading={panel.loading}
            busy={panel.busy}
            logs={panel.logs}
            serverId={props.server.id}
            selectedUpdateFile={panel.selectedUpdateFile}
            updateContent={panel.updateContent}
            selectedUpdateInfo={panel.selectedUpdateInfo}
            onOpenUpdateLog={(serverId, fileName) =>
              void panel.openUpdateLog(serverId, fileName)
            }
            onClearUpdateLogs={panel.confirmClearUpdateLogs}
            onOpenInExternalViewer={() => void panel.openInExternalViewer()}
            onDeleteSelectedUpdate={panel.confirmDeleteSelectedUpdate}
          />
        </Tabs.Panel>

        <Tabs.Panel value="backups" className={classes.tabPanel}>
          <LogsBackupsTab
            loading={panel.loading}
            busy={panel.busy}
            logs={panel.logs}
            highlightedBackupId={panel.highlightedBackupId}
            onClearBackups={panel.confirmClearBackups}
            onDeleteBackup={panel.confirmDeleteBackup}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
