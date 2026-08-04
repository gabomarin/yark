import type { ReactElement } from "react";
import { Alert, Switch, Text } from "@mantine/core";
import classes from "./ServerForm.module.css";

interface Props {
  autoStart: boolean;
  showInactiveWarning: boolean;
  onAutoStartChange: (value: boolean) => void;
}

export function ServerFormStartupFields(props: Props): ReactElement {
  return (
    <>
      <div className={classes.startupRow}>
        <div className={classes.startupCopy}>
          <Text size="sm" fw={600}>
            Auto-start with YARK
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Start this server automatically after YARK launches and startup
            checks finish. Default off.
          </Text>
        </div>
        <Switch
          checked={props.autoStart}
          onChange={(event) => props.onAutoStartChange(event.currentTarget.checked)}
          aria-label="Auto-start with YARK"
        />
      </div>
      {props.showInactiveWarning && (
        <Alert color="yellow" variant="light">
          Preference is saved, but Inactive servers never auto-start. Enable the
          server first.
        </Alert>
      )}
    </>
  );
}
