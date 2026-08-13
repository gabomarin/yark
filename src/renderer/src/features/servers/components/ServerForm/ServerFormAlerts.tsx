import type { ReactElement } from "react";
import { Alert, Stack } from "@mantine/core";

interface Props {
  filesJobActive: boolean;
  moveJobActive: boolean;
  serverActive: boolean;
}

/** Running / files / move warnings above the edit form (#292). */
export function ServerFormAlerts(props: Props): ReactElement | null {
  if (!props.filesJobActive && !props.moveJobActive && !props.serverActive) {
    return null;
  }

  return (
    <Stack gap="sm">
      {props.filesJobActive && (
        <Alert color="yellow" title="Updating server files">
          You can save profile settings now. Wait until the file update finishes
          before starting Move installation.
        </Alert>
      )}
      {props.moveJobActive && (
        <Alert color="yellow" title="Moving installation">
          Wait until the move finishes before starting or updating this server.
        </Alert>
      )}
      {props.serverActive && !props.filesJobActive && !props.moveJobActive && (
        <Alert color="yellow" title="Server is running">
          You can save changes now; they will apply after the server restarts.
        </Alert>
      )}
    </Stack>
  );
}
