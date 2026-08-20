import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
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
import type { FleetInstallRef } from "@shared/server-install-path";
import type { MoveInstallProgress, ServerProfile } from "@shared/types";
import { normalizeMoveInstallProgress } from "@shared/types";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import { showOperatorToast } from "@ui/operatorToast";
import { MoveInstallDestFields } from "./MoveInstallDestFields";
import {
  moveDestFolderName,
  resolveMoveDestDir,
} from "./moveInstallPathWarning";
import { useMoveDestPreview } from "./useMoveDestPreview";

interface Props {
  opened: boolean;
  server: ServerProfile | null;
  /** Fleet profiles for dest nesting preview (#294). */
  servers?: readonly ServerProfile[];
  onClose: () => void;
  /** Called after a successful move when the operator dismisses the result. */
  onMoved: () => void;
}

type Phase = "form" | "running" | "success" | "error";

export function MoveInstallDialog(props: Props): ReactElement {
  const [destinationDir, setDestinationDir] = useState("");
  const [createFolder, setCreateFolder] = useState(true);
  const [browsing, setBrowsing] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<MoveInstallProgress | null>(null);
  const [oldSourceDir, setOldSourceDir] = useState<string | null>(null);
  const [oldSourceRemoved, setOldSourceRemoved] = useState(true);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  const fleet = useMemo(
    (): FleetInstallRef[] =>
      (props.servers ?? []).map((server) => ({
        id: server.id,
        name: server.name,
        installDir: server.installDir,
      })),
    [props.servers],
  );
  const folderName = moveDestFolderName(
    props.server?.installDir ?? "",
    props.server?.name ?? "server",
  );
  const resolvedDest = resolveMoveDestDir(destinationDir, folderName, createFolder);
  const { previewIssue, probePending, destVacant } = useMoveDestPreview({
    opened: props.opened,
    destDir: resolvedDest,
    sourceDir: props.server?.installDir ?? "",
    excludeId: props.server?.id,
    fleet,
  });

  useEffect(() => {
    if (!props.opened || props.server === null) {
      return;
    }
    setDestinationDir("");
    setCreateFolder(true);
    setPhase("form");
    setError(null);
    setProgress(null);
    setOldSourceDir(null);
    setOldSourceRemoved(true);
    setCleanupBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset form on open/server id change; server object identity is intentionally not tracked
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress listener uses server id only; opened covers lifecycle
  }, [props.opened, props.server?.id]);

  const handleBrowse = async (): Promise<void> => {
    setBrowsing(true);
    try {
      const result = await window.api.pickPath(
        "directory",
        destinationDir.trim().length > 0
          ? destinationDir
          : props.server?.installDir,
        createFolder
          ? "Choose destination base folder"
          : "Choose destination install folder",
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
    const dest = resolvedDest.trim();
    if (dest.length === 0) {
      setError("Destination directory is required");
      return;
    }
    if (previewIssue !== null || probePending || !destVacant) {
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
    if (result.data.oldSourceRemoved) {
      showOperatorToast({
        title: "Move completed",
        message:
          "The server now uses the new folder and the previous installation was removed.",
      });
    }
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
      ? resolvedDest.trim().length > 0 &&
        previewIssue === null &&
        !probePending &&
        destVacant
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
          <MoveInstallDestFields
            pickedDir={destinationDir}
            createFolder={createFolder}
            folderName={folderName}
            resolvedDest={resolvedDest}
            browsing={browsing}
            previewIssue={previewIssue}
            onBrowse={() => void handleBrowse()}
            onCreateFolderChange={setCreateFolder}
          />
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
          <Text size="sm" c="dimmed">
            Installation moved. Close when you are ready.
          </Text>
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
            <Button color="red" variant="filled" onClick={() => void handleCancelCopy()}>
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
                variant="filled"
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
