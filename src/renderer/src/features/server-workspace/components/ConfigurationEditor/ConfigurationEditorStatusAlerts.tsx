import type { ReactElement } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";

interface Props {
  error: string | null;
  onDismissError: () => void;
  /** Save lost a race with an external INI edit (#665). */
  staleDocument?: boolean;
  /** Disk/pending changed while the editor has unsaved edits (#665). */
  externalChangeDetected?: boolean;
  onReloadStale?: () => void;
  onDismissExternalChange?: () => void;
  reloadBusy?: boolean;
  serverActive: boolean;
  filesJobActive: boolean;
  /** Durable draft queued until the process stops (#530). */
  pendingQueued: boolean;
}

function ReloadFromDiskButton(props: { busy: boolean; onClick?: () => void }): ReactElement | null {
  if (props.onClick === undefined) {
    return null;
  }
  return (
    <Group gap="xs">
      <Button variant="default" size="compact-sm" loading={props.busy} onClick={props.onClick}>
        Reload from disk
      </Button>
    </Group>
  );
}

function SaveErrorAlert(props: {
  error: string;
  staleDocument: boolean;
  reloadBusy: boolean;
  onDismiss: () => void;
  onReload?: () => void;
}): ReactElement {
  if (!props.staleDocument) {
    return (
      <AppAlert color="red" mb="sm" onClose={props.onDismiss} withCloseButton>
        {props.error}
      </AppAlert>
    );
  }
  return (
    <AppAlert color="red" mb="sm" title="INI changed outside YARK" onClose={props.onDismiss} withCloseButton>
      <Stack gap="xs">
        <Text size="sm">{props.error}</Text>
        <ReloadFromDiskButton busy={props.reloadBusy} onClick={props.onReload} />
      </Stack>
    </AppAlert>
  );
}

function ExternalChangeAlert(props: {
  reloadBusy: boolean;
  onDismiss?: () => void;
  onReload?: () => void;
}): ReactElement {
  return (
    <AppAlert color="attention" mb="sm" title="INI changed outside YARK" onClose={props.onDismiss} withCloseButton>
      <Stack gap="xs">
        <Text size="sm">
          The files on disk (or the queued draft) changed since this editor loaded. Reload to see those edits, or keep
          editing — Save will still refuse to overwrite them until you reload.
        </Text>
        <ReloadFromDiskButton busy={props.reloadBusy} onClick={props.onReload} />
      </Stack>
    </AppAlert>
  );
}

export function ConfigurationEditorStatusAlerts(props: Props): ReactElement | null {
  const {
    error,
    onDismissError,
    staleDocument = false,
    externalChangeDetected = false,
    onReloadStale,
    onDismissExternalChange,
    reloadBusy = false,
    serverActive,
    filesJobActive,
    pendingQueued,
  } = props;

  if (error === null && !externalChangeDetected && !serverActive && !pendingQueued) {
    return null;
  }

  return (
    <>
      {error !== null && (
        <SaveErrorAlert
          error={error}
          staleDocument={staleDocument}
          reloadBusy={reloadBusy}
          onDismiss={onDismissError}
          onReload={onReloadStale}
        />
      )}
      {externalChangeDetected && error === null && (
        <ExternalChangeAlert reloadBusy={reloadBusy} onDismiss={onDismissExternalChange} onReload={onReloadStale} />
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
