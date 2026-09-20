import type { ReactElement } from "react";
import { Stack } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";

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
        <AppAlert color="attention" title="Updating server files">
          You can save profile settings now. Wait until the file update finishes before starting Move installation.
        </AppAlert>
      )}
      {props.moveJobActive && (
        <AppAlert color="attention" title="Moving installation">
          Wait until the move finishes before starting or updating this server.
        </AppAlert>
      )}
      {props.serverActive && !props.filesJobActive && !props.moveJobActive && (
        <AppAlert color="attention" title="Server is running">
          You can save changes now; they will apply after the server restarts.
        </AppAlert>
      )}
    </Stack>
  );
}
