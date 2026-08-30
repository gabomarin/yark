import {
  ArrowSquareOut,
  ClockCounterClockwise,
  FileText,
  Trash,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Badge,
  Group,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import type { ServerOperationalLogs, ServerUpdateLogFile } from "@shared/types";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type { ReactElement } from "react";
import { ConsoleSurface } from "@ui/ConsoleSurface/ConsoleSurface";
import { SelectableListRow } from "@ui/SelectableListRow/SelectableListRow";
import classes from "../../LogsPage.module.css";
import {
  formatDuration,
  formatSize,
  formatUpdateJobLabel,
  statusColor,
  statusLabel,
} from "../../model/serverLogsFormat";
import {
  LogsClearAction,
  LogsDetailItem,
  LogsEmptyState,
  LogsTabIntro,
} from "../LogsPanelChrome/LogsPanelChrome";

export interface LogsUpdatesTabProps {
  embedded?: boolean;
  loading: boolean;
  busy: boolean;
  logs: ServerOperationalLogs | null;
  serverId: string;
  selectedUpdateFile: string | null;
  updateContent: string;
  selectedUpdateInfo: ServerUpdateLogFile | null;
  onOpenUpdateLog: (serverId: string, fileName: string) => void;
  onClearUpdateLogs: () => void;
  onOpenInExternalViewer: () => void;
  onDeleteSelectedUpdate: () => void;
}

export function LogsUpdatesTab(props: LogsUpdatesTabProps): ReactElement {
  const {
    embedded,
    loading,
    busy,
    logs,
    serverId,
    selectedUpdateFile,
    updateContent,
    selectedUpdateInfo,
    onOpenUpdateLog,
    onClearUpdateLogs,
    onOpenInExternalViewer,
    onDeleteSelectedUpdate,
  } = props;

  return (
    <Stack gap="sm" className={classes.updatesStack}>
      <LogsTabIntro
        embedded={embedded}
        title="Updates"
        purpose="Detailed download and install logs for this server."
        useWhen="When an update failed or files look wrong, pick a run on the left and read the log on the right."
        action={
          <LogsClearAction
            label="Clear all update logs for this server"
            onClick={onClearUpdateLogs}
            disabled={
              loading ||
              busy ||
              logs === null ||
              logs.updateFiles.length === 0
            }
          />
        }
      />
      <div className={classes.updatesLayout}>
        <div className={`${classes.historyPanel} ${classes.fillPanel}`}>
          <Stack gap="sm" className={classes.panelStack}>
            <Title order={4} className={classes.panelTitle}>
              Job history
            </Title>
            {loading ? (
              <Text c="dimmed">Loading history…</Text>
            ) : logs === null || logs.updateFiles.length === 0 ? (
              <LogsEmptyState
                icon={<ClockCounterClockwise size={24} />}
                title="No update jobs yet"
                description="Install, update, or verify files to create a SteamCMD job log."
              />
            ) : (
              <div
                className={classes.updateList}
                data-logs-scroll-region="updates-list"
              >
                {logs.updateFiles.map((file) => {
                  const label = formatUpdateJobLabel(file.fileName, file.modifiedAt);
                  return (
                    <SelectableListRow
                      key={file.fileName}
                      selected={selectedUpdateFile === file.fileName}
                      onClick={() => onOpenUpdateLog(serverId, file.fileName)}
                      title={file.fileName}
                      className={classes.updateHistoryRow}
                      trailing={
                        <Badge
                          color={statusColor(file.status)}
                          variant="light"
                          className={classes.updateStatus}
                        >
                          {statusLabel(file.status)}
                        </Badge>
                      }
                    >
                      <Text size="sm" fw={600} className={classes.updateTitle}>
                        {label.title}
                      </Text>
                      <Text size="xs" c="dimmed" className={classes.updateSubtitle}>
                        {label.subtitle}
                      </Text>
                    </SelectableListRow>
                  );
                })}
              </div>
            )}
          </Stack>
        </div>

        <div className={`${classes.detailPanel} ${classes.fillPanel}`}>
          <Stack gap="sm" className={classes.panelStack}>
            <Group
              justify="space-between"
              align="center"
              wrap="wrap"
              gap="sm"
              className={classes.detailHeader}
            >
              <Group gap="sm" wrap="nowrap">
                <Title order={4} className={classes.panelTitle}>
                  Update details
                </Title>
                {selectedUpdateInfo !== null && (
                  <Badge
                    color={statusColor(selectedUpdateInfo.status)}
                    variant="light"
                  >
                    {selectedUpdateInfo.status}
                  </Badge>
                )}
              </Group>
              {selectedUpdateInfo !== null && (
                <Group gap="xs">
                  <Tooltip label="Open in external viewer">
                    <ActionIcon
                      variant="default"
                      aria-label="Open in external viewer"
                      onClick={onOpenInExternalViewer}
                      disabled={busy}
                    >
                      <ArrowSquareOut size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete this update log">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Delete this update log"
                      onClick={onDeleteSelectedUpdate}
                      disabled={busy}
                    >
                      <Trash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )}
            </Group>

            {selectedUpdateInfo === null ? (
              <Text c="dimmed">Select an update to see details.</Text>
            ) : (
              <>
                <div className={classes.detailsMeta}>
                  <LogsDetailItem
                    label="Date"
                    value={formatLogDateTime(selectedUpdateInfo.modifiedAt)}
                    icon={<ClockCounterClockwise size={16} />}
                  />
                  <LogsDetailItem
                    label="Duration"
                    value={formatDuration(selectedUpdateInfo.durationMs)}
                    icon={<ClockCounterClockwise size={16} />}
                  />
                  <LogsDetailItem
                    label="Size"
                    value={formatSize(selectedUpdateInfo.sizeBytes)}
                    icon={<FileText size={16} />}
                  />
                </div>
                <ConsoleSurface
                  fill
                  className={classes.squareConsole}
                  text={
                    updateContent.length > 0 ? updateContent : "Loading log content…"
                  }
                  data-logs-scroll-region="update-content"
                />
              </>
            )}
          </Stack>
        </div>
      </div>
    </Stack>
  );
}
