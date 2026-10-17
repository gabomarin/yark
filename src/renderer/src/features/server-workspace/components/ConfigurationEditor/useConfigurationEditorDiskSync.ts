import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { modals } from "@mantine/modals";
import { iniFingerprintsMatch } from "@shared/ini/ini-fingerprints";
import type { IniPreview, ServerIniPayload, ServerIniSnapshot } from "@shared/types";
import { showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";

/**
 * Reload-from-disk + focus/visibility fingerprint re-check (#665).
 * Keeps {@link useConfigurationEditor} under the feature-file size cap.
 */
export function useConfigurationEditorDiskSync(options: {
  serverId: string;
  dirtyRef: RefObject<boolean>;
  busyRef: RefObject<boolean>;
  loadingRef: RefObject<boolean>;
  snapshotRef: RefObject<ServerIniSnapshot | null>;
  applyLoadedSnapshotRef: MutableRefObject<(data: ServerIniSnapshot, options?: { preserveDirty?: boolean }) => void>;
  setBusy: (busy: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setStaleDocument: (stale: boolean) => void;
  setSnapshot: (snapshot: ServerIniSnapshot | null) => void;
  setPayload: (payload: ServerIniPayload | null) => void;
  setBaseline: (baseline: ServerIniPayload | null) => void;
  setPreview: (preview: IniPreview | null) => void;
  publishDirty: (nextPayload: ServerIniPayload | null, nextBaseline: ServerIniPayload | null) => void;
}): {
  externalChangeDetected: boolean;
  setExternalChangeDetected: (value: boolean) => void;
  reloadFromDisk: () => Promise<void>;
  requestReloadFromDisk: () => void;
  clearExternalChangeFlags: () => void;
} {
  const {
    serverId,
    dirtyRef,
    busyRef,
    loadingRef,
    snapshotRef,
    applyLoadedSnapshotRef,
    setBusy,
    setLoading,
    setError,
    setStaleDocument,
    setSnapshot,
    setPayload,
    setBaseline,
    setPreview,
    publishDirty,
  } = options;

  const [externalChangeDetected, setExternalChangeDetected] = useState(false);
  const freshnessCheckInFlight = useRef(false);

  const clearExternalChangeFlags = (): void => {
    setExternalChangeDetected(false);
    setStaleDocument(false);
  };

  const reloadFromDisk = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    clearExternalChangeFlags();
    await runWithFinally(
      async () => {
        const result = await window.api.readServerIni(serverId);
        if (!result.ok) {
          setError(result.error ?? "Could not read the INI");
          return;
        }
        applyLoadedSnapshotRef.current(result.data);
      },
      () => {
        setBusy(false);
      },
    );
  };

  const requestReloadFromDisk = (): void => {
    if (!dirtyRef.current) {
      void reloadFromDisk();
      return;
    }
    modals.openConfirmModal({
      title: "Reload from disk?",
      children:
        "This discards your unsaved INI edits and loads the files from disk (or the queued draft if the server is running).",
      labels: { confirm: "Reload", cancel: "Cancel" },
      confirmProps: { color: "attention" },
      onConfirm: () => {
        void reloadFromDisk();
      },
    });
  };

  const checkDiskFreshness = async (): Promise<void> => {
    if (freshnessCheckInFlight.current || busyRef.current || loadingRef.current) {
      return;
    }
    const current = snapshotRef.current;
    if (current === null) {
      return;
    }
    freshnessCheckInFlight.current = true;
    try {
      const result = await window.api.readServerIni(serverId);
      if (!result.ok) {
        return;
      }
      if (iniFingerprintsMatch(result.data.fingerprints, current.fingerprints)) {
        setExternalChangeDetected(false);
        return;
      }
      if (dirtyRef.current) {
        setExternalChangeDetected(true);
        return;
      }
      applyLoadedSnapshotRef.current(result.data);
      setError(null);
      showOperatorToast({
        title: "INI reloaded",
        message: "Loaded newer files from disk (or the queued draft).",
      });
    } finally {
      freshnessCheckInFlight.current = false;
    }
  };

  useEffect(() => {
    const onWindowFocus = (): void => {
      void checkDiskFreshness();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") {
        void checkDiskFreshness();
      }
    };
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // Intentionally serverId-only: helpers read latest state via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus listeners; freshness uses refs
  }, [serverId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStaleDocument(false);
    setExternalChangeDetected(false);
    setPreview(null);
    publishDirty(null, null);

    void runWithFinally(
      async () => {
        const result = await window.api.readServerIni(serverId);
        if (cancelled) return;
        if (!result.ok) {
          setSnapshot(null);
          setPayload(null);
          setBaseline(null);
          setError(result.error ?? "Could not read the INI");
          publishDirty(null, null);
          return;
        }
        applyLoadedSnapshotRef.current(result.data);
      },
      () => {
        if (!cancelled) {
          setLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on server change; apply via ref
  }, [serverId]);

  useEffect(() => {
    return window.api.onServerIniChanged((event) => {
      if (event.serverId !== serverId) {
        return;
      }
      void (async () => {
        const result = await window.api.readServerIni(serverId);
        if (!result.ok) {
          return;
        }
        applyLoadedSnapshotRef.current(result.data, { preserveDirty: true });
      })();
    });
  }, [serverId, applyLoadedSnapshotRef]);

  return {
    externalChangeDetected,
    setExternalChangeDetected,
    reloadFromDisk,
    requestReloadFromDisk,
    clearExternalChangeFlags,
  };
}
