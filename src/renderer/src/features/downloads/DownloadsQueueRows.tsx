import type { ReactElement } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowCounterClockwise,
  Pause,
  Play,
  ProhibitInset,
  X,
} from "@phosphor-icons/react";
import { ActionIcon, Progress, Tooltip, UnstyledButton } from "@mantine/core";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import { downloadRowMeta } from "./downloadsCopy";
import type { DownloadRow, DownloadRowKind } from "./downloadsModel";
import classes from "./DownloadsPage.module.css";

export function sectionTitle(kind: DownloadRowKind): string {
  if (kind === "active" || kind === "interrupted") return "Active";
  if (kind === "queued") return "Queued";
  if (kind === "paused") return "Paused";
  if (kind === "cancelled") return "Cancelled";
  return "Needs attention";
}

export function DownloadRowButton(props: {
  row: DownloadRow;
  selected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onResume: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}): ReactElement {
  const { row } = props;
  return (
    <div
      className={classes.rowButton}
      data-selected={props.selected || undefined}
      data-kind={row.kind}
      data-download-row={row.id}
    >
      <UnstyledButton className={classes.rowHit} onClick={props.onSelect}>
        {row.mapId !== null && (
          <MapArtThumb
            mapId={row.mapId}
            mapModId={row.mapModId}
            modThumbnailUrl={row.modThumbnailUrl}
            size={row.kind === "active" || row.kind === "interrupted" ? "md" : "sm"}
            shape="rounded"
            decorative
            className={classes.rowThumb}
          />
        )}
        <span className={classes.rowTitle}>
          <span className={classes.rowTitleLine}>
            <span className={classes.rowTitleText}>{row.title}</span>
          </span>
          <span className={classes.rowMeta}>{downloadRowMeta(row)}</span>
        </span>
        <span className={classes.rowProgressCol}>
          {row.percent !== null ? (
            <Progress value={row.percent} size="sm" radius="xl" striped animated />
          ) : null}
        </span>
        <span className={classes.rowPercent}>
          {row.percent !== null ? `${row.percent.toFixed(0)}%` : ""}
        </span>
      </UnstyledButton>
      <span className={classes.rowActions}>
        {(row.canMoveUp || row.canMoveDown) && (
          <span className={classes.reorderGroup}>
            <Tooltip label="Move up in queue">
              <ActionIcon
                size="sm"
                variant="subtle"
                className={row.canMoveUp ? classes.reorderActionReady : undefined}
                aria-label="Move up in queue"
                disabled={!row.canMoveUp}
                onClick={() => props.onMoveUp()}
              >
                <ArrowUp size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Move down in queue">
              <ActionIcon
                size="sm"
                variant="subtle"
                className={row.canMoveDown ? classes.reorderActionReady : undefined}
                aria-label="Move down in queue"
                disabled={!row.canMoveDown}
                onClick={() => props.onMoveDown()}
              >
                <ArrowDown size={14} />
              </ActionIcon>
            </Tooltip>
          </span>
        )}
        {row.kind === "paused" && (
          <Tooltip label="Resume">
            <ActionIcon
              size="sm"
              color="teal"
              variant="light"
              aria-label="Resume download"
              onClick={() => props.onResume()}
            >
              <Play size={14} weight="fill" />
            </ActionIcon>
          </Tooltip>
        )}
        {(row.kind === "attention" || row.kind === "cancelled" || row.kind === "interrupted")
          && row.job?.nextActions.includes("retry") === true && (
          <Tooltip label="Retry">
            <ActionIcon
              size="sm"
              color="teal"
              variant="light"
              aria-label="Retry download"
              onClick={() => props.onRetry()}
            >
              <ArrowCounterClockwise size={14} />
            </ActionIcon>
          </Tooltip>
        )}
        {(row.kind === "attention" || row.kind === "cancelled" || row.kind === "interrupted")
          && row.job?.nextActions.includes("dismiss") === true && (
          <Tooltip label="Dismiss">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label="Dismiss download"
              onClick={() => props.onDismiss()}
            >
              <X size={14} />
            </ActionIcon>
          </Tooltip>
        )}
        {row.kind === "active" && row.usesLiveCancel && (
          <span data-download-live-action>
            <Tooltip label={row.canPause ? "Pause" : "Cancel"}>
              <ActionIcon
                size="sm"
                color={row.canPause ? "yellow" : "red"}
                variant="light"
                aria-label={row.canPause ? "Pause download" : "Cancel download"}
                onClick={() => props.onCancel()}
              >
                {row.canPause ? (
                  <Pause size={14} weight="fill" />
                ) : (
                  <ProhibitInset size={14} />
                )}
              </ActionIcon>
            </Tooltip>
          </span>
        )}
        {(row.kind === "queued" || row.kind === "paused") && (
          <Tooltip label={row.canPause ? "Pause" : "Cancel"}>
            <ActionIcon
              size="sm"
              color={row.canPause ? "yellow" : "red"}
              variant="light"
              aria-label={row.canPause ? "Pause download" : "Cancel download"}
              onClick={() => props.onCancel()}
            >
              {row.canPause ? (
                <Pause size={14} weight="fill" />
              ) : (
                <ProhibitInset size={14} />
              )}
            </ActionIcon>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
