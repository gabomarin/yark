import { ScrollArea, type ScrollAreaProps } from "@mantine/core";
import type { ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";
import classes from "./ConsoleSurface.module.css";

type Props = {
  text: string;
  className?: string;
  /** Stretch inside a flex column parent (Logs panes). */
  fill?: boolean;
  /** Default true — keep pinned to the latest lines while streaming. */
  stickToBottom?: boolean;
  /** Distance-from-bottom threshold in px; default 48. */
  stickThresholdPx?: number;
  h?: ScrollAreaProps["h"];
  mah?: ScrollAreaProps["mah"];
  type?: ScrollAreaProps["type"];
  "data-logs-scroll-region"?: string;
};

/**
 * Shared monospace console pane (Mantine ScrollArea) for SteamCMD / Logs.
 * Plain text only — no syntax highlighting.
 *
 * Prefer a fixed `h` (or `fill`) so the viewport is a real scroll container.
 * `mah` alone uses Autosize for grow-then-scroll panels.
 */
export function ConsoleSurface(props: Props): ReactElement {
  const {
    text,
    className,
    fill = false,
    stickToBottom = true,
    stickThresholdPx = 48,
    h,
    mah,
    type = "auto",
    "data-logs-scroll-region": logsScrollRegion,
  } = props;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const programmaticScrollRef = useRef(false);

  const scrollToBottomIfSticky = (): void => {
    if (!stickToBottom || !stickRef.current) {
      return;
    }
    const node = viewportRef.current;
    if (node === null) {
      return;
    }
    programmaticScrollRef.current = true;
    node.scrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
    // Release after paint so layout/scrollbar updates do not clear stickiness.
    requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
  };

  useLayoutEffect(() => {
    scrollToBottomIfSticky();
    // Autosize / font metrics can settle one frame later after text grows.
    const frame = requestAnimationFrame(() => {
      scrollToBottomIfSticky();
    });
    return () => cancelAnimationFrame(frame);
    // stickThresholdPx is only for user-scroll detection, not pinning.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pin on text changes only
  }, [text, stickToBottom]);

  const rootClassName = [classes.root, fill ? classes.fill : null, className]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");

  const regionProps =
    logsScrollRegion !== undefined
      ? ({ "data-logs-scroll-region": logsScrollRegion } as const)
      : {};

  const sharedScrollProps = {
    type,
    viewportRef,
    onScrollPositionChange: ({ y }: { x: number; y: number }) => {
      if (!stickToBottom || programmaticScrollRef.current) {
        return;
      }
      const node = viewportRef.current;
      if (node === null) {
        return;
      }
      const distanceFromBottom = node.scrollHeight - y - node.clientHeight;
      stickRef.current = distanceFromBottom < stickThresholdPx;
    },
  };

  const content = <pre className={classes.content}>{text}</pre>;

  // Plain ScrollArea with only mah grows with content (no inner scroll). Autosize
  // matches grow-then-scroll; SteamCMD dock should pass fixed `h` for reliable pinning.
  const useAutosize = mah != null && h == null && !fill;

  if (useAutosize) {
    return (
      <ScrollArea.Autosize
        className={rootClassName}
        mah={mah}
        {...sharedScrollProps}
        {...regionProps}
      >
        {content}
      </ScrollArea.Autosize>
    );
  }

  return (
    <ScrollArea
      className={rootClassName}
      h={h ?? (fill ? "100%" : undefined)}
      mah={mah}
      {...sharedScrollProps}
      {...regionProps}
    >
      {content}
    </ScrollArea>
  );
}
