import type { ReactElement } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";

interface Props {
  error: string | null;
  onDismissError: () => void;
  /** Save lost a race with an external INI edit (#665). */
  staleDocument?: boolean;
  onReloadStale?: () => void;
  reloadBusy?: boolean;
  serverActive: boolean;
  filesJobActive: boolean;
  /** Durable draft queued until the process stops (#530). */
  pendingQueued: boolean;
}

export function ConfigurationEditorStatusAlerts(props: Props): ReactElement | null {
  const {
    error,
    onDismissError,
    staleDocument = false,
    onReloadStale,
    reloadBusy = false,
    serverActive,
    filesJobActive,
    pendingQueued,
  } = props;

  if (error === null && !serverActive && !pendingQueued) {
    return null;
  }

  return (
    <>
      {error !== null && (
        <AppAlert
          color="red"
          mb="sm"
          title={staleDocument ? "INI changed outside YARK" : undefined}
          onClose={onDismissError}
          withCloseButton
        >
          {staleDocument ? (
            <Stack gap="xs">
              <Text size="sm">{error}</Text>
              {onReloadStale !== undefined && (
                <Group gap="xs">
                  <Button variant="default" size="compact-sm" loading={reloadBusy} onClick={onReloadStale}>
                    Reload from disk
                  </Button>
                </Group>
              )}
            </Stack>
          ) : (
            error
          )}
        </AppAlert>
      )}
      {pendingQueued && (
        <AppAlert color="attention" mb="sm" title="INI queued">
          Your saved draft is waiting. YARK will write it to the install when the server stops (or before the next
          start). Open in editor shows the live files, which may still be outdated.
        </AppAlert>
      )}
      {serverActive && !filesJobActive && !pendingQueued && (
        <AppAlert color="attention" mb="sm" title="Server is running">
          Saving queues your changes until the server stops — ASA may overwrite live INI files while it is running.
        </AppAlert>
      )}
    </>
  );
}
