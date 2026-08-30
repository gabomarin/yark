import { createElement, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Alert } from "@mantine/core";
import type { ServerProfile, SteamCmdCacheKind, SteamCmdStatus } from "@shared/types";
import {
  decideFilesJobEnqueue,
  filesJobEnqueueCopy,
  occupyingFilesJobForServer,
} from "@shared/files-job-priority";
import type { Overlay } from "@app/model/appOverlay";
import type { Route } from "@layout/Sidebar/Sidebar";
import { openDangerConfirmModal } from "@ui/DangerConfirmModal/openDangerConfirmModal";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import type { useAppFleetRefresh } from "@app/hooks/useAppFleetRefresh";

type Refresh = ReturnType<typeof useAppFleetRefresh>["refresh"];

export function useAppSteamCmdActions(options: {
  servers: ServerProfile[];
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdBusy: boolean;
  refresh: Refresh;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  setRoute: Dispatch<SetStateAction<Route>>;
}) {
  const { servers, steamCmdStatus, steamCmdBusy, refresh, setOverlay, setRoute } = options;

  const runAction = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> => {
      const result = await action();
      if (!result.ok) {
        showOperatorError(result.error ?? "Unknown error");
      }
      await refresh();
      return result.ok;
    },
    [refresh],
  );

  const runPauseSteamCmd = useCallback(async (): Promise<boolean> => {
    const result = await window.api.pauseSteamCmd();
    if (!result.ok) {
      const message = result.error ?? "Unknown error";
      if (/not available during rollback|cannot pause/i.test(message)) {
        showOperatorToast({
          title: "Pause unavailable",
          message,
          color: "yellow",
        });
      } else {
        showOperatorError(message);
      }
    }
    await refresh();
    return result.ok;
  }, [refresh]);

  const openDownloads = useCallback(() => {
    setOverlay(null);
    setRoute("downloads");
  }, [setOverlay, setRoute]);

  const startSteamFilesJob = useCallback(
    (serverId: string, kind: "install" | "update" | "verify") => {
      const serverName = servers.find((server) => server.id === serverId)?.name ?? serverId;
      const operation =
        kind === "install" ? "install-files" : kind === "verify" ? "verify-files" : "update";
      const actionLabel =
        kind === "install" ? "Install" : kind === "verify" ? "Verify" : "Update";
      const occupant = occupyingFilesJobForServer(
        steamCmdStatus?.criticalJobs ?? [],
        serverId,
      );
      const decision = decideFilesJobEnqueue(operation, occupant);
      if (decision.action !== "enqueue" && decision.action !== "replace") {
        const copy = filesJobEnqueueCopy(operation, decision, serverName);
        showOperatorToast({
          id: `files-job-${decision.occupant.id}`,
          title: copy.title,
          message: copy.message,
          color: "gray",
          onClick: openDownloads,
        });
        return;
      }
      if (decision.action === "replace") {
        const copy = filesJobEnqueueCopy(operation, decision, serverName);
        showOperatorToast({
          id: `files-replaced-${serverId}-${kind}`,
          title: copy.title,
          message: copy.message,
          color: "blue",
          onClick: openDownloads,
        });
      } else if (steamCmdBusy) {
        showOperatorToast({
          id: `files-queued-${serverId}-${kind}`,
          title: "Added to Downloads",
          message: `${actionLabel} for "${serverName}" will start after the current SteamCMD job.`,
          color: "blue",
          onClick: openDownloads,
        });
      }
      const labels = {
        install: {
          doneTitle: "Install finished",
          doneMessage: `Server files for "${serverName}" are ready.`,
          failTitle: "Install failed",
          cancelMessage: `Install for "${serverName}" was cancelled.`,
          pauseMessage: `Install for "${serverName}" was paused.`,
        },
        update: {
          doneTitle: "Update finished",
          doneMessage: `"${serverName}" is on the latest files.`,
          failTitle: "Update failed",
          cancelMessage: `Update for "${serverName}" was cancelled.`,
          pauseMessage: `Update for "${serverName}" was paused.`,
        },
        verify: {
          doneTitle: "Verification complete",
          doneMessage: `Integrity check for "${serverName}" finished.`,
          failTitle: "Verification failed",
          cancelMessage: `Integrity check for "${serverName}" was cancelled.`,
          pauseMessage: `Integrity check for "${serverName}" was paused.`,
        },
      } as const;
      const copy = labels[kind];
      void (async () => {
        const result =
          kind === "install"
            ? await window.api.installServerFiles(serverId)
            : kind === "verify"
              ? await window.api.verifyServerFiles(serverId)
              : await window.api.updateServerNow(serverId);
        if (!result.ok) {
          const message = result.error ?? "Unknown error";
          if (/Replaced by .+ in the Downloads queue/i.test(message)) {
            await refresh();
            return;
          }
          if (
            /already in the Downloads queue|already in Downloads|Resume it from Downloads|Cancel it first, or wait/i.test(
              message,
            )
          ) {
            showOperatorToast({
              title: "Already in Downloads",
              message,
              color: "gray",
              onClick: openDownloads,
            });
          } else if (/paused/i.test(message)) {
            showOperatorToast({
              title: "Paused",
              message: copy.pauseMessage,
              color: "yellow",
            });
          } else if (/cancell?ed|cancelad/i.test(message)) {
            showOperatorToast({
              title: "Cancelled",
              message: copy.cancelMessage,
              color: "gray",
            });
          } else {
            showOperatorError(message, copy.failTitle);
          }
        } else {
          showOperatorToast({
            title: copy.doneTitle,
            message: copy.doneMessage,
          });
        }
        await refresh();
      })();
    },
    [openDownloads, refresh, servers, steamCmdBusy, steamCmdStatus],
  );

  const pickSteamCmdPath = useCallback(async () => {
    const pick = await window.api.pickPath(
      "file",
      steamCmdStatus?.executablePath ?? undefined,
      "Select steamcmd.exe",
    );
    if (!pick.ok) {
      showOperatorError(pick.error ?? "Could not open file picker");
      return;
    }
    if (pick.data === null) {
      return;
    }
    const setRes = await window.api.setSteamCmdPath(pick.data);
    if (!setRes.ok) {
      showOperatorError(setRes.error ?? "Could not configure steamcmd.exe");
      return;
    }
    await refresh();
  }, [refresh, steamCmdStatus?.executablePath]);

  const openSteamCmdCache = useCallback(
    (kind: SteamCmdCacheKind) => {
      void runAction(() => window.api.openSteamCmdCache(kind));
    },
    [runAction],
  );

  const clearSteamCmdCache = useCallback(
    (kind: SteamCmdCacheKind) => {
      const label = kind === "depot" ? "download cache" : "shared server files";
      const detail =
        kind === "depot"
          ? "Removes temporary files Steam already downloaded. The next install or update will download them again."
          : "Removes the ready-made ARK server copy used to set up new servers faster. The next install will rebuild it first.";
      openDangerConfirmModal({
        title: `Clear ${label}?`,
        children: createElement(
          Alert,
          { color: "orange", variant: "light", title: "Cannot be undone" },
          detail,
        ),
        confirmLabel: "Clear cache",
        onConfirm: () => {
          void (async () => {
            const result = await window.api.clearSteamCmdCache(kind);
            if (!result.ok) {
              showOperatorError(result.error ?? `Could not clear ${label}`);
              return;
            }
            showOperatorToast({
              title: `${label.charAt(0).toUpperCase()}${label.slice(1)} cleared`,
              message:
                "Removed. The next install or update will download what it needs.",
            });
            await refresh();
          })();
        },
      });
    },
    [refresh],
  );

  return {
    runAction,
    runPauseSteamCmd,
    startSteamFilesJob,
    pickSteamCmdPath,
    openSteamCmdCache,
    clearSteamCmdCache,
  };
}
