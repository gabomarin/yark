import { useCallback, useEffect, useState } from "react";
import type {
  AsaApiInstallProgress,
  AsaApiPluginInfo,
  AsaApiStatus,
  ServerProfile,
} from "@shared/types";
import type { AsaApiBusyKind, AsaApiConfirm } from "./asaApiPanelModel";

export function useServerAsaApiPanel(
  server: ServerProfile,
  onServerUpdated: () => void,
): {
  status: AsaApiStatus | null;
  loading: boolean;
  busy: AsaApiBusyKind | null;
  confirm: AsaApiConfirm | null;
  error: string | null;
  versionHint: string | null;
  installProgress: AsaApiInstallProgress | null;
  locked: boolean;
  isBusy: (kind: AsaApiBusyKind) => boolean;
  persistAsaApiFlags: (next: {
    useAsaApi: boolean;
    useAsaApiLoader: boolean;
  }) => Promise<void>;
  onInstall: () => Promise<void>;
  onUninstall: () => void;
  onClearCache: () => void;
  onPluginEnabled: (
    plugin: AsaApiPluginInfo,
    enabled: boolean,
  ) => Promise<void>;
  onDeletePlugin: (plugin: AsaApiPluginInfo) => void;
  closeConfirm: () => void;
  runConfirm: () => void;
  onAddPluginZip: () => Promise<void>;
} {
  const [status, setStatus] = useState<AsaApiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<AsaApiBusyKind | null>(null);
  const [confirm, setConfirm] = useState<AsaApiConfirm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionHint, setVersionHint] = useState<string | null>(null);
  const [installProgress, setInstallProgress] =
    useState<AsaApiInstallProgress | null>(null);

  const locked = busy !== null;
  const isBusy = (kind: AsaApiBusyKind): boolean => busy === kind;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await window.api.getAsaApiStatus(server.id);
    if (!result.ok) {
      setError(result.error);
      setStatus(null);
      setLoading(false);
      return;
    }
    setStatus(result.data);
    if (result.data.installedVersionLabel) {
      setVersionHint(result.data.installedVersionLabel);
    }
    setLoading(false);
  }, [server.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return window.api.onAsaApiInstallProgress((payload) => {
      if (payload.serverId !== server.id) return;
      setInstallProgress(payload.active ? payload : null);
    });
  }, [server.id]);

  const persistAsaApiFlags = async (next: {
    useAsaApi: boolean;
    useAsaApiLoader: boolean;
  }): Promise<void> => {
    setBusy("flags");
    setError(null);
    const result = await window.api.updateServerPatch(server.id, {
      group: "asaApi",
      useAsaApi: next.useAsaApi,
      useAsaApiLoader: next.useAsaApiLoader,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onServerUpdated();
    await refresh();
  };

  const onInstall = async (): Promise<void> => {
    setBusy("install");
    setError(null);
    setInstallProgress({
      serverId: server.id,
      active: true,
      phase: "resolving",
      label: "Starting download…",
      percent: 1,
      bytesDownloaded: null,
      bytesTotal: null,
      assetLabel: null,
      error: null,
    });
    const result = await window.api.installAsaApi(server.id);
    setBusy(null);
    setInstallProgress(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(result.data);
    setVersionHint(result.data.installedVersionLabel);
  };

  const onUninstall = (): void => {
    setConfirm({ kind: "uninstall" });
  };

  const onClearCache = (): void => {
    setConfirm({ kind: "clearCache" });
  };

  const onPluginEnabled = async (
    plugin: AsaApiPluginInfo,
    enabled: boolean,
  ): Promise<void> => {
    setBusy("pluginToggle");
    setError(null);
    const result = await window.api.setAsaApiPluginEnabled(
      server.id,
      plugin.name,
      enabled,
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(result.data);
  };

  const onDeletePlugin = (plugin: AsaApiPluginInfo): void => {
    setConfirm({ kind: "deletePlugin", plugin });
  };

  const closeConfirm = (): void => {
    if (locked) return;
    setConfirm(null);
  };

  const runConfirm = (): void => {
    if (confirm === null) return;
    const pending = confirm;
    void (async () => {
      setError(null);
      if (pending.kind === "uninstall") {
        setBusy("uninstall");
        const result = await window.api.uninstallAsaApi(server.id);
        setBusy(null);
        setConfirm(null);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStatus(result.data);
        setVersionHint(null);
        onServerUpdated();
        return;
      }
      if (pending.kind === "clearCache") {
        setBusy("clearCache");
        const result = await window.api.clearAsaApiCache();
        setBusy(null);
        setConfirm(null);
        if (!result.ok) {
          setError(result.error);
        }
        return;
      }
      setBusy("deletePlugin");
      const result = await window.api.deleteAsaApiPlugin(
        server.id,
        pending.plugin.name,
      );
      setBusy(null);
      setConfirm(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus(result.data);
    })();
  };

  const onAddPluginZip = async (): Promise<void> => {
    setBusy("addPlugin");
    setError(null);
    const result = await window.api.addAsaApiPluginZip(server.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data === null) return;
    setStatus(result.data);
  };

  return {
    status,
    loading,
    busy,
    confirm,
    error,
    versionHint,
    installProgress,
    locked,
    isBusy,
    persistAsaApiFlags,
    onInstall,
    onUninstall,
    onClearCache,
    onPluginEnabled,
    onDeletePlugin,
    closeConfirm,
    runConfirm,
    onAddPluginZip,
  };
}
