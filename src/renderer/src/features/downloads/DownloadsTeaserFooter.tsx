import type { ReactElement } from "react";
import { Badge, Progress } from "@mantine/core";
import type { DownloadsTeaser } from "./downloadsTeaserModel";
import classes from "./DownloadsTeaserFooter.module.css";

interface Props {
  model: DownloadsTeaser;
  onOpenDownloads: () => void;
}

export function DownloadsTeaserFooter(props: Props): ReactElement | null {
  if (!props.model.visible) {
    return null;
  }

  return (
    <footer className={classes.footer} role="status" data-downloads-footer>
      <button
        type="button"
        className={classes.footerMain}
        onClick={props.onOpenDownloads}
        aria-label="Open Downloads queue"
      >
        <span
          className={`${classes.statusDot} ${
            props.model.attention ? classes.statusDotAttention : classes.statusDotBusy
          }`}
        />
        <span className={classes.footerLine}>
          <span className={classes.footerTitle}>{props.model.title}</span>
          {props.model.detail.length > 0 && (
            <>
              <span className={classes.footerSep}> · </span>
              <span className={classes.footerDetail}>{props.model.detail}</span>
            </>
          )}
        </span>
        {(props.model.percent !== null || props.model.attention) && (
          <span className={classes.footerMetrics}>
            {props.model.percent !== null && (
              <>
                <span className={classes.footerPercent}>
                  {props.model.percent.toFixed(0)}%
                </span>
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
          </span>
        )}
      </button>
    </footer>
  );
}
