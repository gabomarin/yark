import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { Alert, Button, Group, Splitter, Stack, Text } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import type { ServerProfile, SteamCmdConsoleSnapshot, SteamCmdStatus } from "@shared/types";
import {
  buildDownloadRows,
  defaultSelectedRowId,
  downloadConsoleBody,
  downloadStatusLine,
  findDownloadRow,
  shouldAutoExpandAdvancedLog,
  type DownloadRow,
  type DownloadRowKind,
} from "./downloadsModel";
import { DownloadRowButton, sectionTitle } from "./DownloadsQueueRows";
import { useDownloadQueueFlip } from "./useDownloadQueueFlip";
import { ConsoleSurface } from "@ui/ConsoleSurface/ConsoleSurface";
import classes from "./DownloadsPage.module.css";

interface Props {
  status: SteamCmdStatus;
  console: SteamCmdConsoleSnapshot | null;
  servers: ServerProfile[];
  onCancelLive: () => void;
  onPauseLive: () => void;
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onResumeJob: (jobId: string) => void;
  onDismissJob: (jobId: string) => void;
  onReorderJob: (jobId: string, direction: "up" | "down") => void;
  onOpenSettings?: () => void;
}

const DEFAULT_SPLIT_SIZES: [number, number] = [52, 48];
const ADVANCED_LOG_STORAGE_KEY = "yark.downloads.advancedLog.expanded.v1";

export function DownloadsPage(props: Props): ReactElement {
  const serversById = useMemo(() => {
    const map = new Map<string, ServerProfile>();
    for (const server of props.servers) {
      map.set(server.id, server);
    }
    return map;
  }, [props.servers]);
  const activeServer =
    props.status.serverId !== null
      ? (serversById.get(props.status.serverId) ?? null)
      : null;
  const rows = useMemo(
    () =>
      buildDownloadRows(props.status, {
        activeServer,
        serversById,
      }),
    [activeServer, props.status, serversById],
  );
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    defaultSelectedRowId(rows),
  );
  const [splitSizes, setSplitSizes] = useLocalStorage<[number, number]>({
    key: "yark.downloads.splitSizes",
    defaultValue: DEFAULT_SPLIT_SIZES,
  });
  const [logExpanded, setLogExpanded] = useLocalStorage({
    key: ADVANCED_LOG_STORAGE_KEY,
    defaultValue: false,
  });
  const queueRef = useRef<HTMLElement>(null);
  useDownloadQueueFlip(
    queueRef,
    rows.map((row) => row.id),
  );

  useEffect(() => {
    if (selectedId !== null && rows.some((row) => row.id === selectedId)) {
      return;
    }
    setSelectedId(defaultSelectedRowId(rows));
  }, [rows, selectedId]);

  const selected = findDownloadRow(rows, selectedId);
  const groups: DownloadRowKind[] = ["active", "interrupted", "paused", "queued", "cancelled", "attention"];
  const consoleBody = downloadConsoleBody(rows, props.console?.lines ?? []);
  const statusLine = downloadStatusLine(selected, consoleBody);
  const autoExpandLog = shouldAutoExpandAdvancedLog(rows);

  useEffect(() => {
    if (autoExpandLog) setLogExpanded(true);
  }, [autoExpandLog, setLogExpanded]);

  const cancelRow = (row: DownloadRow) => {
    if (row.kind === "queued" && row.job !== null) {
      props.onCancelJob(row.job.id);
      return;
    }
    if (row.usesLiveCancel) {
      if (row.canPause) {
        props.onPauseLive();
        return;
      }
      props.onCancelLive();
      return;
    }
    if (row.job !== null && row.job.nextActions.includes("cancel")) {
      props.onCancelJob(row.job.id);
    }
  };

  const steamcmdMissingBanner =
    !props.status.detected && rows.length > 0 ? (
      <Alert
        color="red"
        variant="light"
        title="SteamCMD is not installed"
        className={classes.steamcmdMissingBanner}
        data-steamcmd-missing-banner
      >
        <Stack gap="xs">
          Install SteamCMD in Settings before installs, updates, or verify can
          run.
          {props.onOpenSettings !== undefined && (
            <Button
              size="compact-sm"
              variant="light"
              color="red"
              onClick={props.onOpenSettings}
            >
              Install SteamCMD
            </Button>
          )}
        </Stack>
      </Alert>
    ) : null;

  const queuePane = (
    <section
      ref={queueRef}
      className={classes.queueSection}
      aria-label="Download queue"
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={<DownloadSimple size={28} weight="duotone" />}
          title="No transfers right now"
          description={
            props.status.detected
              ? "SteamCMD is ready. Your installs, updates, and verify jobs will appear here."
              : "Install SteamCMD in Settings first. Installs, updates, and verify jobs will appear here."
          }
          action={
            !props.status.detected && props.onOpenSettings !== undefined ? (
              <Button size="compact-sm" variant="light" onClick={props.onOpenSettings}>
                Install SteamCMD
              </Button>
            ) : undefined
          }
          layout="stacked"
          titleOrder="h3"
        />
      ) : (
        groups.map((kind) => {
          const sectionRows = rows.filter((row) => row.kind === kind);
          if (sectionRows.length === 0) return null;
          return (
            <Stack key={kind} gap="xs" className={classes.queueGroup} data-kind={kind} data-queue-group={kind}>
              <div className={classes.sectionLabel}>{sectionTitle(kind)}</div>
              <div
                className={
                  kind === "queued" || kind === "cancelled"
                    ? classes.queueRowList
                    : classes.queueRowStack
                }
              >
                {sectionRows.map((row) => (
                  <DownloadRowButton
                    key={row.id}
                    row={row}
                    selected={selected?.id === row.id}
                    onSelect={() => setSelectedId(row.id)}
                    onCancel={() => cancelRow(row)}
                    onResume={() => {
                      if (row.job !== null) {
                        props.onResumeJob(row.job.id);
                      }
                    }}
                    onRetry={() => {
                      if (row.job !== null) {
                        props.onRetryJob(row.job.id);
                      }
                    }}
                    onDismiss={() => {
                      if (row.job !== null) {
                        props.onDismissJob(row.job.id);
                      }
                    }}
                    onMoveUp={() => {
                      if (row.job !== null) {
                        props.onReorderJob(row.job.id, "up");
                      }
                    }}
                    onMoveDown={() => {
                      if (row.job !== null) {
                        props.onReorderJob(row.job.id, "down");
                      }
                    }}
                  />
                ))}
              </div>
            </Stack>
          );
        })
      )}
    </section>
  );

  const consolePane = (
    <div className={classes.consoleOnlyPane} aria-label="SteamCMD console" data-steamcmd-console>
      <ConsoleSurface fill text={consoleBody} />
    </div>
  );

  const logToggle = (
    <Group
      justify="space-between"
      wrap="nowrap"
      gap="sm"
      className={classes.logDockBar}
    >
      <Text size="sm" className={classes.logStatus} lineClamp={1} data-downloads-status>
        {statusLine}
      </Text>
      <Button
        size="compact-xs"
        variant="subtle"
        aria-label={logExpanded ? "Hide advanced log" : "Advanced log"}
        aria-expanded={logExpanded}
        aria-controls="downloads-advanced-log"
        onClick={() => setLogExpanded(!logExpanded)}
      >
        {logExpanded ? "Hide advanced log" : "Advanced log"}
      </Button>
    </Group>
  );

  return (
    <PageScaffold
      title="Downloads"
      fillViewport
    >
      <div
        className={classes.downloadsLayout}
        data-downloads-page
        data-advanced-log-expanded={logExpanded || undefined}
      >
        {rows.length === 0 ? (
          <div className={classes.upperPane}>
            {queuePane}
          </div>
        ) : logExpanded ? (
          <Splitter
            orientation="vertical"
            h="100%"
            sizes={splitSizes}
            onSizeChange={(sizes) =>
              setSplitSizes([Math.round(Number(sizes[0])), Math.round(Number(sizes[1]))])
            }
          >
            <Splitter.Pane defaultSize={DEFAULT_SPLIT_SIZES[0]} min={30}>
              <div className={classes.upperPane}>
                {steamcmdMissingBanner}
                {queuePane}
              </div>
            </Splitter.Pane>
            <Splitter.Pane defaultSize={DEFAULT_SPLIT_SIZES[1]} min={20}>
              <div className={classes.consoleStack} id="downloads-advanced-log">
                {logToggle}
                {consolePane}
              </div>
            </Splitter.Pane>
          </Splitter>
        ) : (
          <div className={classes.upperPane}>
            {steamcmdMissingBanner}
            {queuePane}
            {logToggle}
          </div>
        )}
      </div>
    </PageScaffold>
  );
}
