import { steamCmdByteProgressNoun } from "@shared/steamcmd-progress";
import type { SteamCmdStatus } from "@shared/types";
import type { DownloadRow } from "./downloadsModel";

export type DownloadsTeaser = {
  visible: boolean;
  title: string;
  detail: string;
  percent: number | null;
  attention: boolean;
  canCancel: boolean;
  canResume: boolean;
  canPause: boolean;
  canRetry: boolean;
  usesLiveCancel: boolean;
  selectedJobId: string | null;
};

export function buildDownloadsTeaser(
  status: SteamCmdStatus,
  rows: DownloadRow[],
): DownloadsTeaser {
  const attentionRows = rows.filter((row) => row.kind === "attention");
  const attentionHint =
    attentionRows.length > 0
      ? `${attentionRows.length} need review`
      : null;

  const active = rows.find((row) => row.kind === "active");
  if (active !== undefined) {
    const queued = rows.filter((row) => row.kind === "queued").length;
    const byteNoun =
      status.operation !== null ? steamCmdByteProgressNoun(status.operation) : "Files";
    const title =
      active.title === active.serverName
        ? active.title
        : `${active.title} · ${active.serverName}`;
    return {
      visible: true,
      title,
      detail: [
        active.byteProgress !== null ? `${byteNoun}: ${active.byteProgress}` : active.phase,
        queued > 0 ? `${queued} queued` : null,
        attentionHint,
      ]
        .filter(Boolean)
        .join(" · "),
      percent: active.percent,
      attention: attentionRows.length > 0,
      canCancel: true,
      canResume: false,
      canPause: active.canPause,
      canRetry: false,
      usesLiveCancel: active.usesLiveCancel,
      selectedJobId: active.job?.id ?? null,
    };
  }

  const interrupted = rows.find((row) => row.kind === "interrupted");
  if (interrupted !== undefined) {
    return {
      visible: true,
      title: interrupted.title,
      detail: interrupted.subtitle,
      percent: null,
      attention: attentionRows.length > 0,
      canCancel: false,
      canResume: false,
      canPause: false,
      canRetry: interrupted.job?.nextActions.includes("retry") === true,
      usesLiveCancel: false,
      selectedJobId: interrupted.job?.id ?? null,
    };
  }

  const paused = rows.filter((row) => row.kind === "paused");
  if (paused.length > 0) {
    const first = paused[0]!;
    return {
      visible: true,
      title: `${first.title} · paused`,
      detail: [first.subtitle, attentionHint].filter(Boolean).join(" · "),
      percent: first.percent,
      attention: attentionRows.length > 0,
      canCancel: status.detected && first.job?.nextActions.includes("cancel") === true,
      canResume: status.detected,
      canPause: false,
      canRetry: false,
      usesLiveCancel: false,
      selectedJobId: first.job?.id ?? null,
    };
  }

  const attention = rows.filter((row) => row.kind === "attention");
  if (attention.length > 0) {
    return {
      visible: true,
      title: `${attention.length} download${attention.length === 1 ? "" : "s"} need attention`,
      detail: attention.map((row) => row.serverName).join(" · "),
      percent: null,
      attention: true,
      canCancel: false,
      canResume: false,
      canPause: false,
      canRetry: attention[0]?.job?.nextActions.includes("retry") === true,
      usesLiveCancel: false,
      selectedJobId: attention[0]?.job?.id ?? null,
    };
  }

  const cancelledOnly = rows.filter((row) => row.kind === "cancelled");
  if (cancelledOnly.length > 0) {
    const first = cancelledOnly[0]!;
    return {
      visible: true,
      title: `${cancelledOnly.length} cancelled download${cancelledOnly.length === 1 ? "" : "s"}`,
      detail: first.title,
      percent: null,
      attention: false,
      canCancel: false,
      canResume: false,
      canPause: false,
      canRetry: first.job?.nextActions.includes("retry") === true,
      usesLiveCancel: false,
      selectedJobId: first.job?.id ?? null,
    };
  }

  const queuedOnly = rows.filter((row) => row.kind === "queued");
  if (queuedOnly.length > 0) {
    const first = queuedOnly[0]!;
    return {
      visible: true,
      title: `${queuedOnly.length} queued download${queuedOnly.length === 1 ? "" : "s"}`,
      detail: first.title,
      percent: null,
      attention: false,
      canCancel: first.job?.nextActions.includes("cancel") === true,
      canResume: false,
      canPause: false,
      canRetry: false,
      usesLiveCancel: false,
      selectedJobId: first.job?.id ?? null,
    };
  }

  return {
    visible: false,
    title: "",
    detail: "",
    percent: null,
    attention: false,
    canCancel: false,
    canResume: false,
    canPause: false,
    canRetry: false,
    usesLiveCancel: false,
    selectedJobId: null,
  };
}
