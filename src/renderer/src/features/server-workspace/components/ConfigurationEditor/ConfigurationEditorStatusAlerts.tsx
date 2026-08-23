import type { ReactElement } from "react";
import { Alert } from "@mantine/core";

interface Props {
  error: string | null;
  onDismissError: () => void;
  serverActive: boolean;
  filesJobActive: boolean;
}

export function ConfigurationEditorStatusAlerts(props: Props): ReactElement | null {
  const { error, onDismissError, serverActive, filesJobActive } = props;

  if (error === null && !serverActive && !filesJobActive) {
    return null;
  }

  return (
    <>
      {error !== null && (
        <Alert color="red" mb="sm" onClose={onDismissError} withCloseButton>
          {error}
        </Alert>
      )}
      {serverActive && !filesJobActive && (
        <Alert color="yellow" mb="sm" title="Server is running">
          INI changes will apply after the server restarts.
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
