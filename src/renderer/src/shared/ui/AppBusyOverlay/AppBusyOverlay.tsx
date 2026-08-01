import type { ReactElement } from "react";
import { Loader, Progress, Stack, Text } from "@mantine/core";
import classes from "./AppBusyOverlay.module.css";

export interface AppBusyOverlayContent {
  title: string;
  message: string;
  percent: number | null;
}

interface Props {
  content: AppBusyOverlayContent;
}

/** Full-shell blocking overlay — eats pointer events so chrome stays inert. */
export function AppBusyOverlay({ content }: Props): ReactElement {
  const label = content.message.trim() || content.title;
  return (
    <div
      className={classes.root}
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="app-busy-overlay-title"
      aria-describedby="app-busy-overlay-message"
      data-app-busy-overlay
    >
      <div className={classes.panel}>
        <Stack gap="sm" align="center">
          <Loader size="md" color="blue" />
          <Text id="app-busy-overlay-title" size="sm" fw={600} ta="center">
            {content.title}
          </Text>
          <Text id="app-busy-overlay-message" size="sm" c="dimmed" ta="center">
            {label}
          </Text>
          <Progress
            className={classes.progress}
            value={content.percent ?? 12}
            animated
            striped
            size="sm"
            radius="xl"
            aria-label={label}
          />
        </Stack>
      </div>
    </div>
  );
}
