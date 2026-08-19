import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { Alert, Button, Splitter, Stack } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { PageScaffold } from "@layout/PageScaffold/PageScaffold";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import type { ServerProfile, SteamCmdConsoleSnapshot, SteamCmdStatus } from "@shared/types";
import {
  buildDownloadRows,
  defaultSelectedRowId,
  findDownloadRow,
  type DownloadRow,
  type DownloadRowKind,
} from "./downloadsModel";
import { DownloadsDetailPanel } from "./DownloadsDetailPanel";
import { DownloadRowButton, sectionTitle } from "./DownloadsQueueRows";
import { useDownloadQueueFlip } from "./useDownloadQueueFlip";
import classes from "./DownloadsPage.module.css";

interface Props {
  status: SteamCmdStatus;
  console: SteamCmdConsoleSnapshot | null;
  servers: ServerProfile[];
  onOpenLogs: (row: DownloadRow) => void;
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
  const activeRow = rows.find((row) => row.kind === "active") ?? null;
  const groups: DownloadRowKind[] = ["active", "paused", "queued", "attention"];
  const consoleText = props.console?.lines ?? [];
  const consoleBody =
    consoleText.length === 0
      ? "Waiting for progress…"
      : consoleText.slice(-120).join("\n");

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

  if (rows.length === 0) {
    return (
      <PageScaffold
        title="Downloads"
        fillViewport
      >
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
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      title="Downloads"
      fillViewport
    >
      <div className={classes.downloadsLayout} data-downloads-page>
        <Splitter
          orientation="vertical"
          h="100%"
          sizes={splitSizes}
          onSizeChange={(sizes) =>
            setSplitSizes([Math.round(Number(sizes[0])), Math.round(Number(sizes[1]))])
          }
        >
          <Splitter.Pane defaultSize={DEFAULT_SPLIT_SIZES[0]} min={30}>
            <section
              ref={queueRef}
              className={classes.queueSection}
              aria-label="Download queue"
            >
              {!props.status.detected && (
                <Alert
                  color="red"
                  title="SteamCMD is not installed"
                  data-steamcmd-missing-banner
                >
                  <Stack gap="xs">
                    Install SteamCMD in Settings before installs, updates, or
                    verify can run.
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
              )}
              {groups.map((kind) => {
                const sectionRows = rows.filter((row) => row.kind === kind);
                if (sectionRows.length === 0) return null;
                return (
                  <Stack key={kind} gap="xs" className={classes.queueGroup} data-kind={kind} data-queue-group={kind}>
                    <div className={classes.sectionLabel}>{sectionTitle(kind)}</div>
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
                  </Stack>
                );
              })}
            </section>
          </Splitter.Pane>

          <Splitter.Pane defaultSize={DEFAULT_SPLIT_SIZES[1]} min={24}>
            <div className={classes.detailPane}>
              <DownloadsDetailPanel
                selected={selected}
                liveRow={activeRow}
                consoleBody={consoleBody}
                onOpenLogs={props.onOpenLogs}
                onCancelLive={props.onCancelLive}
                onPauseLive={props.onPauseLive}
                onCancelRow={cancelRow}
                onRetryJob={props.onRetryJob}
                onResumeJob={props.onResumeJob}
                onDismissJob={props.onDismissJob}
                steamCmdMissing={!props.status.detected}
              />
            </div>
          </Splitter.Pane>
        </Splitter>
      </div>
    </PageScaffold>
  );
}
