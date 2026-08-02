import type { ReactElement } from "react";
import { useEffect } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  TextInput,
} from "@mantine/core";
import { FolderOpen as FolderOpenIcon } from "@phosphor-icons/react";
import type { ServerProfile } from "@shared/types";
import {
  getServerFolderNameError,
  isValidServerFolderName,
  suggestCloneInstallDir,
} from "@shared/server-install-path";
import { useCallback, useState } from "react";

interface Props {
  opened: boolean;
  sourceServer: ServerProfile | null;
  onClose: () => void;
  /** Returns true when the clone succeeded; dialog closes only then. */
  onClone: (params: CloneParams) => Promise<boolean>;
}

export interface CloneParams {
  name: string;
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  installDir: string;
}

interface FormState {
  name: string;
  sessionName: string;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  installDir: string;
}

function toFormState(source: ServerProfile | null): FormState {
  if (!source) {
    return {
      name: "",
      sessionName: "",
      gamePort: "7777",
      queryPort: "27015",
      rconPort: "27020",
      installDir: "",
    };
  }

  const name = `${source.name}-copy`;
  return {
    name,
    sessionName: `${source.sessionName}-copy`,
    gamePort: String(source.gamePort + 10),
    queryPort: String(source.queryPort + 10),
    rconPort: String(source.rconPort + 10),
    installDir: suggestCloneInstallDir(source.installDir, name),
  };
}

function isValidPort(value: string): boolean {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

export function CloneServerDialog(props: Props): ReactElement {
  const [state, setState] = useState<FormState>(() => toFormState(props.sourceServer));
  const [loading, setLoading] = useState(false);

  // Sync form state when sourceServer changes
  useEffect(() => {
    setState(toFormState(props.sourceServer));
  }, [props.sourceServer?.id, props.opened]);

  const nameError = !isValidServerFolderName(state.name.trim())
    ? getServerFolderNameError(state.name.trim())
    : null;

  const portsValid =
    isValidPort(state.gamePort) &&
    isValidPort(state.queryPort) &&
    isValidPort(state.rconPort);

  const canSubmit =
    !nameError &&
    state.name.trim().length > 0 &&
    state.sessionName.trim().length > 0 &&
    state.installDir.trim().length > 0 &&
    portsValid;

  const handleClose = useCallback(() => {
    setState(toFormState(props.sourceServer));
    props.onClose();
  }, [props, props.sourceServer]);

  const handleClone = useCallback(async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      const ok = await props.onClone({
        name: state.name.trim(),
        sessionName: state.sessionName.trim(),
        gamePort: Number(state.gamePort),
        queryPort: Number(state.queryPort),
        rconPort: Number(state.rconPort),
        installDir: state.installDir.trim(),
      });
      if (ok) {
        handleClose();
      }
    } finally {
      setLoading(false);
    }
  }, [state, canSubmit, props, handleClose]);

  const handleOpenFolder = useCallback(async () => {
    const dir = await window.api.pickFolder(state.installDir || undefined);
    if (dir) {
      setState((prev) => ({ ...prev, installDir: dir }));
    }
  }, [state.installDir]);

  return (
    <Modal
      opened={props.opened}
      onClose={handleClose}
      title="Clone server"
      size="md"
      centered
    >
      <Stack gap="md">
        {props.sourceServer && (
          <Alert color="blue" variant="light">
            Cloning from <strong>{props.sourceServer.name}</strong>
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

          <Group gap="xs" align="flex-end">
            <TextInput
              label="Install directory"
              placeholder="C:\servers\my-server"
              value={state.installDir}
              onChange={(event) => {
                const installDir = event.currentTarget.value;
                setState((previous) => ({ ...previous, installDir }));
              }}
              style={{ flex: 1 }}
              required
            />
            <Button
              size="sm"
              variant="default"
              onClick={handleOpenFolder}
              leftSection={<FolderOpenIcon size={14} />}
            >
              Browse
            </Button>
          </Group>
        </Stack>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleClone} loading={loading} disabled={!canSubmit}>
            Clone server
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
