import { useCallback, useEffect, useState } from "react";
import type {
  HostedResourceDto,
  HostedResourceRevisionDto,
  HostedResourcesDiagnosticsDto,
  HostedResourcesOverviewDto,
  IpcResult,
} from "@shared/ipc";
import {
  DEFAULT_HOSTED_RESOURCES_PORT,
  type HostedResourceFormat,
} from "@shared/settings/hosted-resources";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import {
  openDangerConfirmModal,
  dangerConfirmBody,
} from "@ui/DangerConfirmModal/openDangerConfirmModal";

/**
 * A missing / crashed IPC handler rejects instead of returning `IpcResult`,
 * which would otherwise strand the page on its loading state.
 */
async function attempt<T>(run: () => Promise<IpcResult<T>>): Promise<IpcResult<T>> {
  try {
    return await run();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The request failed.",
    };
  }
}

export interface HostedResourceEditorDraft {
  mode: "create" | "publish";
  resourceId: string | null;
  displayName: string;
  format: HostedResourceFormat;
  content: string;
}

export interface HostedResourcesController {
  overview: HostedResourcesOverviewDto | null;
  loading: boolean;
  loadError: string | null;
  busy: string | null;
  portDraft: number | string;
  editor: HostedResourceEditorDraft | null;
  revisionsFor: string | null;
  revisions: HostedResourceRevisionDto[];
  diagnostics: HostedResourcesDiagnosticsDto | null;
  diagnosticsBusy: boolean;
  reload: (opts?: { quiet?: boolean }) => Promise<void>;
  toggleEnabled: (enabled: boolean) => Promise<void>;
  setPortDraft: (value: number | string) => void;
  applyPort: () => Promise<void>;
  openCreate: () => void;
  openEdit: (resource: HostedResourceDto) => void;
  closeEditor: () => void;
  updateEditor: (patch: Partial<HostedResourceEditorDraft>) => void;
  submitEditor: () => Promise<void>;
  openRevisions: (resource: HostedResourceDto) => Promise<void>;
  closeRevisions: () => void;
  publishRevision: (revisionId: string) => Promise<void>;
  toggleResourceEnabled: (resource: HostedResourceDto, enabled: boolean) => void;
  confirmDelete: (resource: HostedResourceDto) => void;
  runDiagnostics: () => Promise<void>;
}

export function useHostedResourcesPage(): HostedResourcesController {
  const [overview, setOverview] = useState<HostedResourcesOverviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [portDraft, setPortDraft] = useState<number | string>(
    DEFAULT_HOSTED_RESOURCES_PORT,
  );
  const [editor, setEditor] = useState<HostedResourceEditorDraft | null>(null);
  const [revisionsFor, setRevisionsFor] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<HostedResourceRevisionDto[]>([]);
  const [diagnostics, setDiagnostics] =
    useState<HostedResourcesDiagnosticsDto | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);

  const reload = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) {
      setLoading(true);
    }
    await runWithFinally(
      async () => {
        const result = await attempt(() => window.api.getHostedResourcesOverview());
        if (!result.ok) {
          setLoadError(result.error);
          showOperatorError(result.error, "Could not load hosted resources");
          return;
        }
        setLoadError(null);
        setOverview(result.data);
        setPortDraft(result.data.state.port);
      },
      () => {
        if (!quiet) {
          setLoading(false);
        }
      },
    );
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const applyState = useCallback(
    async (action: string, run: () => Promise<IpcResult<unknown>>) => {
      setBusy(action);
      await runWithFinally(
        async () => {
          const result = await attempt(run);
          if (!result.ok) {
            showOperatorError(result.error ?? "The change was rejected.");
            return;
          }
          await reload({ quiet: true });
        },
        () => {
          setBusy(null);
        },
      );
    },
    [reload],
  );

  const toggleEnabled = useCallback(
    async (enabled: boolean) => {
      await applyState("toggle", () =>
        window.api.setHostedResourcesEnabled(enabled),
      );
    },
    [applyState],
  );

  const applyPort = useCallback(async () => {
    const port = typeof portDraft === "number" ? portDraft : Number.parseInt(portDraft, 10);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      showOperatorError("Port must be between 1024 and 65535.");
      return;
    }
    await applyState("port", () => window.api.setHostedResourcesPort(port));
  }, [applyState, portDraft]);

  const openCreate = useCallback(() => {
    setEditor({
      mode: "create",
      resourceId: null,
      displayName: "",
      format: "text",
      content: "",
    });
  }, []);

  const openEdit = useCallback((resource: HostedResourceDto) => {
    setEditor({
      mode: "publish",
      resourceId: resource.id,
      displayName: resource.displayName,
      format: resource.format,
      content: "",
    });
  }, []);

  const closeEditor = useCallback(() => {
    setEditor(null);
  }, []);

  const updateEditor = useCallback((patch: Partial<HostedResourceEditorDraft>) => {
    setEditor((previous) => (previous === null ? previous : { ...previous, ...patch }));
  }, []);

  const submitEditor = useCallback(async () => {
    if (editor === null) {
      return;
    }
    const displayName = editor.displayName.trim();
    if (editor.mode === "create" && displayName.length === 0) {
      showOperatorError("Display name is required.");
      return;
    }
    if (editor.content.trim().length === 0) {
      showOperatorError("Content is empty.");
      return;
    }
    setBusy("editor");
    await runWithFinally(
      async () => {
        const result = await attempt(() =>
          editor.mode === "create"
            ? window.api.createHostedResource({
                displayName,
                format: editor.format,
                content: editor.content,
              })
            : window.api.publishHostedResourceContent(
                editor.resourceId ?? "",
                editor.content,
              ),
        );
        if (!result.ok) {
          showOperatorError(result.error, "Could not publish the resource");
          return;
        }
        showOperatorToast({
          title: editor.mode === "create" ? "Resource published" : "Revision published",
          message: "The URL now serves the new bytes.",
        });
        setEditor(null);
        await reload({ quiet: true });
      },
      () => {
        setBusy(null);
      },
    );
  }, [editor, reload]);

  const openRevisions = useCallback(async (resource: HostedResourceDto) => {
    setRevisionsFor(resource.id);
    setRevisions([]);
    const result = await attempt(() =>
      window.api.listHostedResourceRevisions(resource.id),
    );
    if (!result.ok) {
      showOperatorError(result.error, "Could not load revisions");
      return;
    }
    setRevisions(result.data);
  }, []);

  const closeRevisions = useCallback(() => {
    setRevisionsFor(null);
    setRevisions([]);
  }, []);

  const publishRevision = useCallback(
    async (revisionId: string) => {
      if (revisionsFor === null) {
        return;
      }
      setBusy("revision");
      await runWithFinally(
        async () => {
          const result = await attempt(() =>
            window.api.publishHostedResourceRevision(revisionsFor, revisionId),
          );
          if (!result.ok) {
            showOperatorError(result.error, "Could not publish that revision");
            return;
          }
          showOperatorToast({
            title: "Revision restored",
            message: "The URL now serves the selected revision.",
          });
          await reload({ quiet: true });
          const refreshed = await attempt(() =>
            window.api.listHostedResourceRevisions(revisionsFor),
          );
          if (refreshed.ok) {
            setRevisions(refreshed.data);
          }
        },
        () => {
          setBusy(null);
        },
      );
    },
    [reload, revisionsFor],
  );

  const toggleResourceEnabled = useCallback(
    (resource: HostedResourceDto, enabled: boolean) => {
      if (enabled) {
        void applyState("enable", () =>
          window.api.setHostedResourceEnabled(resource.id, true),
        );
        return;
      }
      openDangerConfirmModal({
        title: "Disable resource?",
        confirmLabel: "Disable",
        children: dangerConfirmBody(
          `"${resource.displayName}" stops serving immediately, including after a restart. Revisions stay listed and you can re-enable it anytime.`,
        ),
        onConfirm: () => {
          void applyState("disable", () =>
            window.api.setHostedResourceEnabled(resource.id, false),
          );
        },
      });
    },
    [applyState],
  );

  const confirmDelete = useCallback(
    (resource: HostedResourceDto) => {
      openDangerConfirmModal({
        title: "Delete resource?",
        confirmLabel: "Delete",
        children: dangerConfirmBody(
          `"${resource.displayName}" and all of its revisions are removed. Any server INI pointing at its URL will fail to load.`,
        ),
        onConfirm: () => {
          void applyState("delete", () =>
            window.api.deleteHostedResource(resource.id),
          );
        },
      });
    },
    [applyState],
  );

  const runDiagnostics = useCallback(async () => {
    setDiagnosticsBusy(true);
    await runWithFinally(
      async () => {
        const result = await attempt(() =>
          window.api.getHostedResourcesDiagnostics(),
        );
        if (!result.ok) {
          showOperatorError(result.error, "Diagnostics failed");
          return;
        }
        setDiagnostics(result.data);
      },
      () => {
        setDiagnosticsBusy(false);
      },
    );
  }, []);

  return {
    overview,
    loading,
    loadError,
    busy,
    portDraft,
    editor,
    revisionsFor,
    revisions,
    diagnostics,
    diagnosticsBusy,
    reload,
    toggleEnabled,
    setPortDraft,
    applyPort,
    openCreate,
    openEdit,
    closeEditor,
    updateEditor,
    submitEditor,
    openRevisions,
    closeRevisions,
    publishRevision,
    toggleResourceEnabled,
    confirmDelete,
    runDiagnostics,
  };
}
