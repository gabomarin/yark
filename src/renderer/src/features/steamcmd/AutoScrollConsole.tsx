import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

interface Props {
  lines: string[];
  className?: string;
  emptyText?: string;
  /** How many lines to show (most recent). */
  maxLines?: number;
}

/**
 * Console that auto-scrolls to the end when new lines arrive.
 * If the user scrolls up manually, do not force scroll until they return near the bottom.
 */
export function AutoScrollConsole(props: Props): ReactElement {
  const { lines, className = "", emptyText = "Waiting for progress…", maxLines = 120 } = props;
  const preRef = useRef<HTMLPreElement | null>(null);
  const stickToBottomRef = useRef(true);
  const visible = lines.slice(-maxLines);
  const text = visible.length === 0 ? emptyText : visible.join("\n");

  useEffect(() => {
    const node = preRef.current;
    if (node === null || !stickToBottomRef.current) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={preRef}
      className={className}
      onScroll={() => {
        const node = preRef.current;
        if (node === null) {
          return;
        }
        const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
        stickToBottomRef.current = distanceFromBottom < 48;
      }}
    >
      {text}
    </pre>
  );
}
