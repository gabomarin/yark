import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Progress,
  Stack,
  Text,
} from "@mantine/core";
import type { MoveInstallProgress, ServerProfile } from "@shared/types";
import { normalizeMoveInstallProgress } from "@shared/types";
import { PathField } from "@ui/PathField/PathField";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";

interface Props {
  opened: boolean;
  server: ServerProfile | null;
  onClose: () => void;
  /** Called after a successful move when the operator dismisses the result. */
  onMoved: () => void;
}

type Phase = "form" | "running" | "success" | "error";

export function MoveInstallDialog(props: Props): ReactElement {
  const [destinationDir, setDestinationDir] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<MoveInstallProgress | null>(null);
  const [oldSourceDir, setOldSourceDir] = useState<string | null>(null);
  const [oldSourceRemoved, setOldSourceRemoved] = useState(true);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  useEffect(() => {
    if (!props.opened || props.server === null) {
      return;
    }
    setDestinationDir("");
    setPhase("form");
    setError(null);
    setProgress(null);
    setOldSourceDir(null);
    setOldSourceRemoved(true);
    setCleanupBusy(false);
  }, [props.opened, props.server?.id]);

  useEffect(() => {
    if (!props.opened) {
      return;
    }
    return window.api.onMoveInstallProgress((payload) => {
      const normalized = normalizeMoveInstallProgress(payload);
      if (props.server !== null && normalized.serverId !== props.server.id) {
        return;
      }
      setProgress(normalized);
    });
  }, [props.opened, props.server?.id]);

  const handleBrowse = async (): Promise<void> => {
    setBrowsing(true);
    try {
      const result = await window.api.pickPath(
        "directory",
        destinationDir.trim().length > 0
          ? destinationDir
          : props.server?.installDir,
        "Choose destination install folder",
      );
      if (result.ok && result.data !== null) {
        setDestinationDir(result.data);
      }
    } finally {
      setBrowsing(false);
    }
  };

  const finishSuccess = async (): Promise<void> => {
    if (props.server !== null && !oldSourceRemoved) {
      // Clear awaitingCleanup so progress state does not linger after the dialog closes.
      await window.api.dismissMoveServerInstallCleanup(props.server.id);
    }
    props.onMoved();
    props.onClose();
  };

  const handleStart = async (): Promise<void> => {
    if (props.server === null) return;
    const dest = destinationDir.trim();
    if (dest.length === 0) {
      setError("Destination directory is required");
      return;
    }
    setError(null);
    setPhase("running");
    const result = await window.api.moveServerInstall(props.server.id, dest);
    if (!result.ok) {
      setError(result.error);
      setPhase("error");
      return;
    }
    setOldSourceDir(result.data.oldSourceDir);
    setOldSourceRemoved(result.data.oldSourceRemoved);
    if (!result.data.oldSourceRemoved && result.data.cleanupError !== null) {
      setError(result.data.cleanupError);
    }
    setPhase("success");
  };

  const handleCancelCopy = async (): Promise<void> => {
    const result = await window.api.cancelMoveServerInstall();
    if (!result.ok) {
      setError(result.error);
      setPhase("error");
      return;
    }
    if (!result.data) {
      setError(
        "No active move to cancel. Close this dialog and try again if it looks stuck.",
      );
      setPhase("error");
    }
  };

  const handleRetryCleanup = async (): Promise<void> => {
    if (props.server === null || oldSourceDir === null) return;
    setCleanupBusy(true);
    setError(null);
    try {
      const result = await window.api.cleanupMovedServerInstall(
        props.server.id,
        oldSourceDir,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOldSourceRemoved(true);
    } finally {
      setCleanupBusy(false);
    }
  };

  const handleClose = (): void => {
    // Running / success stay open until Cancel / Done — no click-outside dismiss.
    if (phase === "running" || phase === "success") {
      return;
    }
    props.onClose();
  };

  const percent = progress?.percent ?? null;
  const canStart =
    phase === "form" || phase === "error"
      ? destinationDir.trim().length > 0
      : false;
  const allowChromeClose = phase === "form" || phase === "error";

  return (
    <Modal
      opened={props.opened}
      onClose={handleClose}
      title="Move installation"
      size="lg"
      closeOnClickOutside={allowChromeClose}
      closeOnEscape={allowChromeClose}
      withCloseButton={allowChromeClose}
      centered
    >
      <Stack gap="md">
        {props.server !== null && (
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Current install path
            </Text>
            <ReadonlyPath value={props.server.installDir} compact />
          </Stack>
        )}

        {(phase === "form" || phase === "error") && (
          <>
            <Alert color="blue" variant="light">
              On the same drive, YARK moves the folder in place. Across drives it
              copies first, then switches the profile and removes the previous
              folder after a successful check.
            </Alert>
            <PathField
              label="Destination install directory"
              placeholder="C:\\ark_servers\\my_server_new"
              value={destinationDir}
              required
              onChange={setDestinationDir}
              onBrowse={() => void handleBrowse()}
              busy={browsing}
            />
          </>
        )}

        {phase === "running" && (
          <Stack gap="sm">
            <Group gap="sm" wrap="nowrap" align="center">
              <Loader size="sm" aria-label="Move in progress" />
              <Text size="sm" style={{ flex: 1 }}>
                {progress?.label || "Moving installation…"}
              </Text>
            </Group>
            <Progress
              value={percent ?? 12}
              animated
              striped
            />
            {progress?.destinationDir != null && (
              <Text size="xs" c="dimmed">
                New location: {progress.destinationDir}
              </Text>
            )}
          </Stack>
        )}

        {phase === "success" && oldSourceRemoved && (
          <Alert color="green" title="Move completed">
            The server now uses the new folder and the previous installation was
            removed.
          </Alert>
        )}

        {phase === "success" && !oldSourceRemoved && oldSourceDir !== null && (
          <Stack gap="sm">
            <Alert color="yellow" title="Move completed with a leftover folder">
              The profile uses the new path, but the previous folder could not be
              deleted:
            </Alert>
            <ReadonlyPath value={oldSourceDir} compact />
          </Stack>
        )}

        {error !== null && (
          <Alert color="red" title={phase === "error" ? "Move failed" : "Error"}>
            {error}
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          {(phase === "form" || phase === "error") && (
            <>
              <Button variant="default" onClick={() => props.onClose()}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleStart()}
                disabled={!canStart}
              >
                Start move
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button color="red" variant="light" onClick={() => void handleCancelCopy()}>
              Cancel
            </Button>
          )}
          {phase === "success" && oldSourceRemoved && (
            <Button onClick={() => void finishSuccess()}>Done</Button>
          )}
          {phase === "success" && !oldSourceRemoved && (
            <>
              <Button variant="default" onClick={() => void finishSuccess()}>
                Leave previous folder
              </Button>
              <Button
                color="red"
                loading={cleanupBusy}
                onClick={() => void handleRetryCleanup()}
              >
                Retry delete
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
