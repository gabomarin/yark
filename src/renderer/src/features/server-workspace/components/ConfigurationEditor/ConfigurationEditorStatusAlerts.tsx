import type { ReactElement } from "react";
import { Alert } from "@mantine/core";

interface Props {
  error: string | null;
  onDismissError: () => void;
  serverActive: boolean;
  filesJobActive: boolean;
  /** Durable draft queued until the process stops (#530). */
  pendingQueued: boolean;
}

export function ConfigurationEditorStatusAlerts(props: Props): ReactElement | null {
  const { error, onDismissError, serverActive, filesJobActive, pendingQueued } =
    props;

  if (
    error === null
    && !serverActive
    && !filesJobActive
    && !pendingQueued
  ) {
    return null;
  }

  return (
    <>
      {error !== null && (
        <Alert color="red" mb="sm" onClose={onDismissError} withCloseButton>
          {error}
        </Alert>
      )}
      {pendingQueued && (
        <Alert color="yellow" mb="sm" title="INI queued">
          Your saved draft is waiting. YARK will write it to the install when
          the server stops (or before the next start). Open in editor shows the
          live files, which may still be outdated.
        </Alert>
      )}
      {serverActive && !filesJobActive && !pendingQueued && (
        <Alert color="yellow" mb="sm" title="Server is running">
          Saving queues your changes until the server stops — ASA may overwrite
          live INI files while it is running.
        </Alert>
      )}
      {filesJobActive && (
        <Alert color="yellow" mb="sm" title="Updating server files">
          You can edit INI now. Prefer saving after the file update finishes.
        </Alert>
      )}
    </>
  );
}
