import type { ReactElement } from "react";
import { ArrowCounterClockwise, Pause, Play, ProhibitInset } from "@phosphor-icons/react";
import { Badge, Button, Progress } from "@mantine/core";
import type { DownloadsTeaser } from "./downloadsModel";
import classes from "./DownloadsTeaserFooter.module.css";

interface Props {
  model: DownloadsTeaser;
  onOpenDownloads: () => void;
  onCancel: () => void;
  onResume: () => void;
  onRetry: () => void;
}

export function DownloadsTeaserFooter(props: Props): ReactElement | null {
  if (!props.model.visible) {
    return null;
  }

  return (
    <footer className={classes.footer} role="status" data-downloads-footer>
      <button
        type="button"
        className={classes.footerButton}
        onClick={props.onOpenDownloads}
        aria-label="Open Downloads queue"
      >
        <span
          className={`${classes.statusDot} ${
            props.model.attention ? classes.statusDotAttention : classes.statusDotBusy
          }`}
        />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className={classes.footerTitle}>{props.model.title}</span>
          {props.model.detail.length > 0 && (
            <span className={classes.footerDetail}>{props.model.detail}</span>
          )}
        </span>
        {props.model.percent !== null && (
          <>
            <span className={classes.footerPercent}>{props.model.percent.toFixed(0)}%</span>
            <Progress
              value={props.model.percent}
              size="sm"
              radius="xl"
              className={classes.footerProgress}
              aria-hidden
            />
          </>
        )}
        {props.model.attention && (
          <Badge size="xs" color="yellow" variant="light">
            Review
          </Badge>
        )}
      </button>
      {props.model.canResume ? (
        <Button
          size="compact-xs"
          color="teal"
          variant="light"
          leftSection={<Play size={14} weight="fill" />}
          onClick={(event) => {
            event.stopPropagation();
            props.onResume();
          }}
        >
          Resume
        </Button>
      ) : props.model.canRetry ? (
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<ArrowCounterClockwise size={14} />}
          onClick={(event) => {
            event.stopPropagation();
            props.onRetry();
          }}
        >
          Retry
        </Button>
      ) : props.model.canCancel ? (
        <Button
          size="compact-xs"
          color={props.model.canPause ? "yellow" : "red"}
          variant="light"
          leftSection={
            props.model.canPause ? (
              <Pause size={14} weight="fill" />
            ) : (
              <ProhibitInset size={14} />
            )
          }
          onClick={(event) => {
            event.stopPropagation();
            props.onCancel();
          }}
        >
          {props.model.canPause ? "Pause" : "Cancel"}
        </Button>
      ) : null}
    </footer>
  );
}
