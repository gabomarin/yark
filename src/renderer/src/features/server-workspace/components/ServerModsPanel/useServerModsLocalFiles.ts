import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { notifications } from "@mantine/notifications";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { confirmClearDownloadedModFiles } from "./confirmClearDownloadedModFiles";
import {
  CLEAR_DOWNLOADED_FILES_LABEL,
  NO_LOCAL_MOD_FILES_YET,
  STOP_SERVER_BEFORE_DELETE_MOD_FILES,
} from "./serverModsRowActions";
import type { ModRow } from "./serverModsModel";

interface Input {
  serverId: string;
  projectIds: readonly string[];
  serverActive: boolean | undefined;
  setBusyKey: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setWarning: Dispatch<SetStateAction<string | null>>;
}

/** Open Explorer / clear local ASA mod folders; track which IDs have files (#702). */
export function useServerModsLocalFiles(input: Input): {
  localFilesById: Record<string, boolean>;
  hasLocalFiles: (projectId: string) => boolean;
  openLocalFolder: (projectId: string) => Promise<void>;
  requestClearDownloadedFiles: (row: Pick<ModRow, "id" | "name" | "noPage">) => void;
} {
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const projectIdsKey = input.projectIds.join("\0");
  const prevServerActiveRef = useRef(input.serverActive);
  const prevServerIdRef = useRef(input.serverId);
  const presenceRequestRef = useRef(0);

  const refreshPresence = useCallback(async (serverId: string, projectIds: readonly string[]) => {
    const requestId = ++presenceRequestRef.current;
    if (projectIds.length === 0) {
      if (requestId === presenceRequestRef.current) setPresence({});
      return;
    }
    try {
      const result = await window.api.listLocalModPresence(serverId, [...projectIds]);
      if (requestId !== presenceRequestRef.current) return;
      if (!result.ok) {
        // Soft-fail: keep previous map; actions stay conservative (no local = disabled).
        return;
      }
      setPresence(result.data);
    } catch {
      if (requestId !== presenceRequestRef.current) return;
      // Transport failure — do not enable Open/Clear from a stale map.
      setPresence({});
    }
  }, []);

  useEffect(() => {
    // Drop the previous server's presence immediately so shared Project IDs cannot
    // briefly enable Open/Clear against the new serverId (#702).
    if (prevServerIdRef.current !== input.serverId) {
      prevServerIdRef.current = input.serverId;
      presenceRequestRef.current += 1;
      setPresence({});
    }
    void refreshPresence(input.serverId, input.projectIds);
    // Content key — avoid refetch on identical id list with new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional projectIdsKey
  }, [input.serverId, projectIdsKey, refreshPresence]);

  useEffect(() => {
    const wasActive = prevServerActiveRef.current === true;
    prevServerActiveRef.current = input.serverActive;
    // After Stop, ASA may have written folders — refresh once when the lock clears.
    if (wasActive && input.serverActive !== true) {
      void refreshPresence(input.serverId, input.projectIds);
    }
  }, [input.serverActive, input.serverId, input.projectIds, refreshPresence]);

  const hasLocalFiles = useCallback((projectId: string) => presence[projectId] === true, [presence]);

  const markPresence = (projectId: string, present: boolean) => {
    setPresence((previous) => {
      if (previous[projectId] === present) return previous;
      return { ...previous, [projectId]: present };
    });
  };

  const openLocalFolder = async (projectId: string) => {
    if (!hasLocalFiles(projectId)) {
      input.setWarning(NO_LOCAL_MOD_FILES_YET);
      return;
    }
    input.setError(null);
    input.setWarning(null);
    const result = await window.api.openLocalModFolder(input.serverId, projectId);
    if (!result.ok) {
      input.setError(result.error);
      return;
    }
    if (result.data.message !== null) {
      input.setWarning(result.data.message);
      markPresence(projectId, false);
      return;
    }
    markPresence(projectId, result.data.openedPaths.length > 0);
  };

  const clearDownloadedFiles = async (projectId: string) => {
    const busy = `redownload:${projectId}`;
    input.setBusyKey(busy);
    input.setError(null);
    input.setWarning(null);
    await runWithFinally(
      async () => {
        const result = await window.api.redownloadLocalModFiles(input.serverId, projectId);
        if (!result.ok) {
          input.setError(result.error);
          return;
        }
        markPresence(projectId, false);
        notifications.show({
          color: "ok",
          title: CLEAR_DOWNLOADED_FILES_LABEL,
          message: result.data.message,
        });
      },
      () => {
        input.setBusyKey((current) => (current === busy ? null : current));
      },
    );
  };

  const requestClearDownloadedFiles = (row: Pick<ModRow, "id" | "name" | "noPage">) => {
    if (row.id === null) return;
    if (input.serverActive === true) {
      input.setError(STOP_SERVER_BEFORE_DELETE_MOD_FILES);
      return;
    }
    if (!hasLocalFiles(row.id)) {
      input.setWarning(NO_LOCAL_MOD_FILES_YET);
      return;
    }
    confirmClearDownloadedModFiles(row, () => clearDownloadedFiles(row.id!), {
      onError: (message) => input.setError(message),
    });
  };

  return { localFilesById: presence, hasLocalFiles, openLocalFolder, requestClearDownloadedFiles };
}
