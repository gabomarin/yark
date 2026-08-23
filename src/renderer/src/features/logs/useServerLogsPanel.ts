import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import type { ServerOperationalLogs, ServerProfile } from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { createServerLogsPanelActions } from "./serverLogsPanelActions";
import {
  preserveNewerRuntimeLogs,
  replaceRuntimeLogs,
  type RuntimeLogSourceFilter,
} from "./serverLogsFormat";

export type LogsSection = "events" | "runtime" | "updates" | "backups";

export interface ServerLogsFocus {
  section?: LogsSection;
  eventId?: number;
  updateFileName?: string;
  /** Highlights a backup row under Logs → Backups (failed fleet alerts). */
  backupId?: string;
}

interface UseServerLogsPanelOptions {
  server: ServerProfile;
  focus?: ServerLogsFocus | null;
  onFocusConsumed?: () => void;
}

export function useServerLogsPanel(options: UseServerLogsPanelOptions) {
  const { server, focus, onFocusConsumed } = options;
  const [activeSection, setActiveSection] = useState<LogsSection>(
    focus?.section ?? "events",
  );
  const [logs, setLogs] = useState<ServerOperationalLogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUpdateFile, setSelectedUpdateFile] = useState<string | null>(null);
  const [updateContent, setUpdateContent] = useState("");
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [highlightedBackupId, setHighlightedBackupId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [runtimeSourceFilter, setRuntimeSourceFilter] =
    useState<RuntimeLogSourceFilter>("all");
  const focusKeyRef = useRef<string | null>(null);
  const autoScrollDoneRef = useRef(false);
  const updateLoadGenRef = useRef(0);
  const loadGenRef = useRef(0);
  const runtimePollGenRef = useRef(0);
  const runtimeRevisionRef = useRef(0);

  const applyLoadedLogs = useCallback(
    (data: ServerOperationalLogs, revision: number) =>
      setLogs((prev) =>
        preserveNewerRuntimeLogs(
          data,
          prev,
          runtimeRevisionRef.current !== revision,
        ),
      ),
    [],
  );

  const clearUpdateContent = useCallback(() => {
    updateLoadGenRef.current += 1;
    setSelectedUpdateFile(null);
    setUpdateContent("");
    setBusy(false);
  }, []);

  const openUpdateLog = useCallback(async (serverId: string, fileName: string) => {
    const gen = ++updateLoadGenRef.current;
    setBusy(true);
    setError(null);
    await runWithFinally(
      async () => {
        const result = await window.api.readServerUpdateLog(serverId, fileName, 150_000);
        if (gen !== updateLoadGenRef.current) return;
        if (!result.ok) {
          setError(result.error ?? "Could not open update log");
          return;
        }
        setSelectedUpdateFile(fileName);
        setUpdateContent(result.data);
      },
      () => {
        if (gen === updateLoadGenRef.current) setBusy(false);
      },
    );
  }, []);

  const load = useCallback(
    async (serverId: string, loadOptions?: { quiet?: boolean }) => {
      const quiet = loadOptions?.quiet === true;
      const gen = ++loadGenRef.current;
      const runtimeRevision = runtimeRevisionRef.current;
      if (!quiet) {
        setLoading(true);
        setError(null);
        clearUpdateContent();
      }
      return runWithFinally(
        async () => {
          const result = await window.api.listServerLogs(serverId);
          if (gen !== loadGenRef.current) return;
          if (!result.ok) {
            if (!quiet) {
              setLogs(null);
              setError(result.error ?? "Could not load logs");
            }
            return;
          }
          if (result.data.serverId !== serverId) return;
          applyLoadedLogs(result.data, runtimeRevision);
          return result.data;
        },
        () => {
          if (!quiet && gen === loadGenRef.current) setLoading(false);
        },
      );
    },
    [applyLoadedLogs, clearUpdateContent],
  );

  const refreshRuntime = useCallback(
    async (serverId: string) => {
      const gen = ++runtimePollGenRef.current;
      if (typeof window.api.getServerRuntimeLog !== "function") {
        await load(serverId, { quiet: true });
        return;
      }
      const result = await window.api.getServerRuntimeLog(serverId);
      if (gen !== runtimePollGenRef.current) return;
      if (!result.ok || result.data.serverId !== serverId) return;
      runtimeRevisionRef.current += 1;
      setLogs((prev) =>
        replaceRuntimeLogs(prev, serverId, result.data.runtimeLogLines),
      );
    },
    [load],
  );

  useEffect(() => {
    setRuntimeSourceFilter("all");
  }, [server.id]);

  useEffect(() => {
    let alive = true;
    const serverId = server.id;
    const gen = ++loadGenRef.current;
    const runtimeRevision = ++runtimeRevisionRef.current;
    void runWithFinally(
      async () => {
        setLoading(true);
        setError(null);
        clearUpdateContent();
        setHighlightedEventId(null);
        setHighlightedBackupId(null);
        setExpandedEventId(null);
        focusKeyRef.current = null;
        autoScrollDoneRef.current = false;
        const result = await window.api.listServerLogs(serverId);
        if (!alive || gen !== loadGenRef.current) return;
        if (!result.ok) {
          setLogs(null);
          setError(result.error ?? "Could not load logs");
          return;
        }
        if (result.data.serverId !== serverId) return;
        applyLoadedLogs(result.data, runtimeRevision);
      },
      () => {
        if (alive && gen === loadGenRef.current) setLoading(false);
      },
    );
    return () => {
      alive = false;
      clearUpdateContent();
    };
  }, [server.id, applyLoadedLogs, clearUpdateContent]);

  useEffect(() => {
    if (typeof window.api.onBackupsChanged !== "function") return undefined;
    return window.api.onBackupsChanged((payload) => {
      if (payload.serverId !== server.id) return;
      void load(server.id);
    });
  }, [server.id, load]);

  useEffect(() => {
    if (activeSection !== "runtime") return undefined;
    const serverId = server.id;
    const timer = window.setInterval(() => {
      void refreshRuntime(serverId);
    }, 1500);
    return () => {
      window.clearInterval(timer);
      runtimePollGenRef.current += 1;
    };
  }, [server.id, activeSection, refreshRuntime]);

  useEffect(() => {
    if (activeSection === "updates") return;
    clearUpdateContent();
  }, [activeSection, clearUpdateContent]);

  useEffect(() => {
    if (focus == null) {
      focusKeyRef.current = null;
      return;
    }
    const key = `${server.id}:${focus.section ?? ""}:${focus.eventId ?? ""}:${focus.updateFileName ?? ""}:${focus.backupId ?? ""}`;
    if (focusKeyRef.current === key) return;
    focusKeyRef.current = key;
    autoScrollDoneRef.current = false;

    const section: LogsSection =
      typeof focus.eventId === "number"
        ? "events"
        : (focus.section ?? "events");
    setActiveSection(section);
    if (typeof focus.eventId === "number") {
      setHighlightedEventId(focus.eventId);
      setExpandedEventId(focus.eventId);
      setHighlightedBackupId(null);
    } else {
      setHighlightedEventId(null);
      setHighlightedBackupId(section === "backups" ? (focus.backupId ?? null) : null);
    }

    void (async () => {
      const data = logs?.serverId === server.id ? logs : await load(server.id);
      if (focusKeyRef.current !== key) return;
      if (data == null) {
        onFocusConsumed?.();
        return;
      }
      if (section === "updates") {
        const preferred =
          focus.updateFileName ??
          data.updateFiles.find((file) => file.status === "failed")?.fileName ??
          data.updateFiles[0]?.fileName ??
          null;
        if (preferred !== null) {
          await openUpdateLog(server.id, preferred);
          if (focusKeyRef.current !== key) return;
        }
      }
      if (section === "backups") {
        const preferred =
          focus.backupId ??
          data.backups.find((backup) => backup.status === "failed")?.id ??
          null;
        setHighlightedBackupId(preferred);
      } else if (typeof focus.eventId !== "number") {
        setHighlightedBackupId(null);
      }
      onFocusConsumed?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- logs is read at execution time, not as a reactive trigger
  }, [focus, server.id, load, openUpdateLog, onFocusConsumed]);

  useEffect(() => {
    if (highlightedEventId === null || activeSection !== "events") return;
    if (autoScrollDoneRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const node = document.querySelector(
        `[data-log-event-id="${highlightedEventId}"]`,
      ) as HTMLElement | null;
      if (node === null) return;
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      autoScrollDoneRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedEventId, logs, activeSection]);

  useEffect(() => {
    if (highlightedBackupId === null || activeSection !== "backups") return;
    if (autoScrollDoneRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const node = document.querySelector(
        `[data-backup-id="${CSS.escape(highlightedBackupId)}"]`,
      ) as HTMLElement | null;
      if (node === null) return;
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      autoScrollDoneRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedBackupId, logs, activeSection]);

  const selectedUpdateInfo =
    logs?.updateFiles.find((file) => file.fileName === selectedUpdateFile) ?? null;
  const actions = createServerLogsPanelActions({
    serverId: server.id,
    logs,
    selectedUpdateFile,
    selectedUpdateInfo,
    setBusy,
    setError,
    setLogs,
    setHighlightedEventId,
    setExpandedEventId,
    setSelectedUpdateFile,
    setUpdateContent,
    runtimeRevisionRef,
    load,
  });

  return {
    activeSection,
    setActiveSection,
    logs,
    loading,
    busy,
    error,
    selectedUpdateFile,
    updateContent,
    selectedUpdateInfo,
    highlightedEventId,
    highlightedBackupId,
    expandedEventId,
    setExpandedEventId,
    runtimeSourceFilter,
    setRuntimeSourceFilter,
    openUpdateLog,
    load,
    ...actions,
  };
}
