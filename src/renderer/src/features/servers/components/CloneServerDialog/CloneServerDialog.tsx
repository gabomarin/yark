import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  TextInput,
} from "@mantine/core";
import type { CloneInstallProgress, InstallationHealthStatus, ServerProfile } from "@shared/types";
import {
  getServerFolderNameError,
  isValidServerFolderName,
  suggestCloneInstallDir,
} from "@shared/server-install-path";
import { PathField } from "@ui/PathField/PathField";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { CloneCopyProgress } from "./CloneCopyProgress";
import {
  cloneCopyCheckboxDescription,
  cloneCopyWarning,
  isCloneCopyUnavailable,
} from "./cloneCopyAvailability";
import {
  cloneDialogFormState,
  isValidClonePort,
  type CloneFormState,
} from "./cloneServerDialogModel";

interface Props {
  opened: boolean;
  sourceServer: ServerProfile | null;
  /** Fleet profiles for non-conflicting port suggestion (#55). */
  fleetServers?: ReadonlyArray<ServerProfile>;
  /** True when the source process is still live (copy requires Stop). */
  sourceBusy?: boolean;
  /** Install health of the source; copy is disabled when there are no files to duplicate. */
  sourceHealth?: InstallationHealthStatus | null;
  onClose: () => void;
  /** Returns true when the clone succeeded; dialog closes only then. */
  onClone: (params: CloneParams) => Promise<boolean>;
}

interface CloneParams {
  name: string;
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  installDir: string;
  copyInstallFolder: boolean;
}

export function CloneServerDialog(props: Props): ReactElement {
  const fleet = props.fleetServers ?? [];
  const [state, setState] = useState<CloneFormState>(() =>
    cloneDialogFormState(props.sourceServer, fleet),
  );
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<CloneInstallProgress | null>(null);

  // Sync form state when sourceServer changes
  useEffect(() => {
    setState(cloneDialogFormState(props.sourceServer, props.fleetServers ?? []));
    setLoading(false);
    setCancelling(false);
    setProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form sync uses sourceServer content; id/opened cover the actual trigger
  }, [props.sourceServer?.id, props.opened]);

  useEffect(() => {
    if (!props.opened) {
      return;
    }
    return window.api.onCloneInstallProgress((payload) => {
      if (props.sourceServer !== null && payload.serverId !== props.sourceServer.id) {
        return;
      }
      setProgress(payload);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress listener uses sourceServer id only; opened covers lifecycle
  }, [props.opened, props.sourceServer?.id]);

  const nameError = !isValidServerFolderName(state.name.trim())
    ? getServerFolderNameError(state.name.trim())
    : null;

  const portsValid =
    isValidClonePort(state.gamePort) &&
    isValidClonePort(state.queryPort) &&
    isValidClonePort(state.rconPort);

  const copyUnavailable = isCloneCopyUnavailable(props.sourceHealth);
  const wantsCopy = state.copyInstallFolder && !copyUnavailable;
  const copyBlocked = wantsCopy && props.sourceBusy === true;
  const copyWarn = wantsCopy ? cloneCopyWarning(props.sourceHealth) : null;
  const copying = loading && wantsCopy;
  const canSubmit =
    !nameError &&
    state.name.trim().length > 0 &&
    state.sessionName.trim().length > 0 &&
    state.installDir.trim().length > 0 &&
    portsValid &&
    !copyBlocked;

  const handleClose = useCallback(() => {
    if (copying) {
      return;
    }
    setState(cloneDialogFormState(props.sourceServer, props.fleetServers ?? []));
    setProgress(null);
    props.onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceServer content is stable for the dialog lifecycle
  }, [copying, props.onClose, props.sourceServer, props.fleetServers]);

  const handleClone = useCallback(async () => {
    if (!canSubmit) return;

    setLoading(true);
    setProgress(null);
    await runWithFinally(
      async () => {
        const ok = await props.onClone({
          name: state.name.trim(),
          sessionName: state.sessionName.trim(),
          gamePort: Number(state.gamePort),
          queryPort: Number(state.queryPort),
          rconPort: Number(state.rconPort),
          installDir: state.installDir.trim(),
          copyInstallFolder: wantsCopy,
        });
        if (ok) {
          setState(cloneDialogFormState(props.sourceServer, props.fleetServers ?? []));
          setProgress(null);
          props.onClose();
        }
      },
      () => {
        setLoading(false);
        setCancelling(false);
      },
    );
  }, [state, canSubmit, props, wantsCopy]);

  const handleCancelCopy = useCallback(async () => {
    setCancelling(true);
    const result = await window.api.cancelCloneServerCopy();
    if (!result.ok) {
      setCancelling(false);
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const dir = await window.api.pickFolder(state.installDir || undefined);
    if (dir) {
      setState((prev) => ({ ...prev, installDir: dir }));
    }
  }, [state.installDir]);

  const allowChromeClose = !copying;

  return (
    <Modal
      opened={props.opened}
      onClose={handleClose}
      title="Clone server"
      size="md"
      centered
      closeOnClickOutside={allowChromeClose}
      closeOnEscape={allowChromeClose}
      withCloseButton={allowChromeClose}
    >
      <Stack gap="md">
        {copying ? (
          <CloneCopyProgress
            progress={progress}
            onCancel={() => void handleCancelCopy()}
            cancelling={cancelling}
          />
        ) : (
          <>
            {props.sourceServer && (
              <Alert color="blue" variant="light">
                Cloning from <strong>{props.sourceServer.name}</strong>.
                Game.ini and GameUserSettings.ini come with the clone; ports and
                session name on this form replace the source values.
              </Alert>
            )}

            <Stack gap="sm">
              <TextInput
                label="Server name"
                placeholder="e.g. My Server"
                value={state.name}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  setState((previous) => {
                    const source = props.sourceServer;
                    const currentSuggestion =
                      source === null
                        ? null
                        : suggestCloneInstallDir(source.installDir, previous.name);
                    return {
                      ...previous,
                      name,
                      installDir:
                        source !== null && previous.installDir === currentSuggestion
                          ? suggestCloneInstallDir(source.installDir, name)
                          : previous.installDir,
                    };
                  });
                }}
                error={nameError}
                required
              />

              <TextInput
                label="Session name"
                placeholder="e.g. My Session"
                value={state.sessionName}
                onChange={(event) => {
                  const sessionName = event.currentTarget.value;
                  setState((previous) => ({ ...previous, sessionName }));
                }}
                required
              />

              <SimpleGrid cols={3} spacing="sm">
                <NumberInput
                  label="Game port"
                  value={Number(state.gamePort) || ""}
                  onChange={(val) =>
                    setState((prev) => ({ ...prev, gamePort: String(val) }))
                  }
                  min={1024}
                  max={65535}
                  required
                />
                <NumberInput
                  label="Query port"
                  value={Number(state.queryPort) || ""}
                  onChange={(val) =>
                    setState((prev) => ({ ...prev, queryPort: String(val) }))
                  }
                  min={1024}
                  max={65535}
                  required
                />
                <NumberInput
                  label="RCON port"
                  value={Number(state.rconPort) || ""}
                  onChange={(val) =>
                    setState((prev) => ({ ...prev, rconPort: String(val) }))
                  }
                  min={1024}
                  max={65535}
                  required
                />
              </SimpleGrid>

              <PathField
                label="Install directory"
                placeholder="C:\\servers\\my-server"
                value={state.installDir}
                required
                onChange={(installDir) => {
                  setState((previous) => ({ ...previous, installDir }));
                }}
                onBrowse={() => void handleOpenFolder()}
              />

              <Checkbox
                label="Copy entire server folder"
                description={cloneCopyCheckboxDescription(props.sourceHealth)}
                checked={wantsCopy}
                disabled={copyUnavailable}
                onChange={(event) => {
                  const copyInstallFolder = event.currentTarget.checked;
                  setState((previous) => ({ ...previous, copyInstallFolder }));
                }}
              />

              {copyBlocked && props.sourceServer && (
                <Alert color="yellow" variant="light">
                  Stop <strong>{props.sourceServer.name}</strong> before copying
                  the entire folder. You can still clone the profile only.
                </Alert>
              )}
              {copyWarn !== null && (
                <Alert color="yellow" variant="light">
                  {copyWarn}
                </Alert>
              )}
            </Stack>

            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleClone} loading={loading} disabled={!canSubmit}>
                Clone server
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
