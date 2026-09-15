import type { ReactElement, ReactNode } from "react";
import { CloseButton, Text } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import classes from "./DismissibleHint.module.css";

type DismissibleHintTone = "info" | "warn" | "ok";

interface Props {
  storageKey: string;
  title: string;
  children: ReactNode;
  /** Left accent severity. Default cryo/info. */
  tone?: DismissibleHintTone;
}

/**
 * Operator gotcha that can be dismissed and stays dismissed on this PC.
 * Renders as a Fluent-style InfoBar (solid panel + left accent), not a light Alert wash.
 */
export function DismissibleHint(props: Props): ReactElement | null {
  const tone = props.tone ?? "info";
  const [dismissed, setDismissed] = useLocalStorage({
    key: props.storageKey,
    defaultValue: false,
  });
  if (dismissed) return null;
  return (
    <div
      className={classes.root}
      data-tone={tone}
      role="status"
      aria-label={props.title}
    >
      <div className={classes.body}>
        <Text size="sm" className={classes.title}>
          {props.title}
        </Text>
        <Text size="xs" className={classes.copy}>
          {props.children}
        </Text>
      </div>
      <CloseButton
        className={classes.dismiss}
        size="sm"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      />
    </div>
  );
}
