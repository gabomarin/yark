import { useEffect, useMemo, useRef, useState } from "react";
import { modals } from "@mantine/modals";
import type {
  IniFileKey,
  IniPreview,
  ServerIniPayload,
  ServerIniSnapshot,
} from "@shared/types";
import { showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import {
  defaultTextForFile,
  filterIniSettingReferences,
  groupSettingReferencesByUiCategory,
  lookupDefaultValue,
  parseIniRows,
  sanitizeServerIniPayload,
  setIniValue,
  textForFile,
  withFileText,
  type IniFilterId,
  type IniSettingReference,
} from "../../iniModel";
import { iniPayloadsDirty } from "./configurationEditorModel";

export function useConfigurationEditor(options: {
  serverId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: (save: (() => Promise<boolean>) | null) => void;
}): {
  snapshot: ServerIniSnapshot | null;
  payload: ServerIniPayload | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  preview: IniPreview | null;
  search: string;
  setSearch: (value: string) => void;
  filter: IniFilterId;
  setFilter: (value: IniFilterId) => void;
  collapsedSections: Record<string, boolean>;
  iniFile: IniFileKey;
  setIniFile: (file: IniFileKey) => void;
  iniMode: "visual" | "text";
  setIniMode: (mode: "visual" | "text") => void;
  dirty: boolean;
  groupedRows: ReturnType<typeof groupSettingReferencesByUiCategory>;
  categoryOptions: { value: string; label: string }[];
  fileLabel: string;
  filePath: string | null;
  updateValue: (
    fileKey: IniFileKey,
    rowSection: string,
    key: string,
    value: string,
    occurrence?: number,
  ) => void;
  resetChanges: () => void;
  resetActiveFileToDefaults: () => void;
  resetRowToDefault: (row: IniSettingReference) => void;
  toggleSection: (sectionName: string) => void;
  setAllSectionsCollapsed: (collapsed: boolean) => void;
  saveIni: () => Promise<boolean>;
  openExternal: () => Promise<void>;
  publishPayloadChange: (nextPayload: ServerIniPayload) => void;
} {
  const { serverId, onRegisterSave } = options;
  const [snapshot, setSnapshot] = useState<ServerIniSnapshot | null>(null);
  const [payload, setPayload] = useState<ServerIniPayload | null>(null);
  const [baseline, setBaseline] = useState<ServerIniPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<IniPreview | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<IniFilterId>("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [iniFile, setIniFile] = useState<IniFileKey>("gameUserSettings");
  const [iniMode, setIniMode] = useState<"visual" | "text">("visual");
  const onDirtyChangeRef = useRef(options.onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = options.onDirtyChange;
  });

  const dirty = iniPayloadsDirty(payload, baseline);

  const publishDirty = (
    nextPayload: ServerIniPayload | null,
    nextBaseline: ServerIniPayload | null,
  ): void => {
    onDirtyChangeRef.current?.(iniPayloadsDirty(nextPayload, nextBaseline));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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
        const sanitized = sanitizeServerIniPayload(result.data.payload);
        setSnapshot({ ...result.data, payload: sanitized });
        setPayload(sanitized);
        setBaseline(sanitized);
        publishDirty(sanitized, sanitized);
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
  }, [serverId]);

  const activeFileKey = iniFile;
  const activeText = payload !== null ? textForFile(payload, activeFileKey) : "";
  const rows = useMemo<IniSettingReference[]>(
    () =>
      parseIniRows(activeText).map((row) => ({
        ...row,
        fileKey: activeFileKey,
      })),
    [activeFileKey, activeText],
  );
  const availableRows = useMemo(
    () => filterIniSettingReferences(rows, "", "all"),
    [rows],
  );
  const categoryOptions = useMemo(
    () => [
      {
        value: "all",
        label: `All settings (${availableRows.length})`,
      },
      ...groupSettingReferencesByUiCategory(availableRows).map((group) => ({
        value: group.category,
        label: `${group.label} (${group.rows.length})`,
      })),
    ],
    [availableRows],
  );
  const visibleRows = useMemo(
    () => filterIniSettingReferences(rows, search, filter),
    [rows, search, filter],
  );
  const groupedRows = useMemo(
    () => groupSettingReferencesByUiCategory(visibleRows),
    [visibleRows],
  );

  useEffect(() => {
    if (!categoryOptions.some((option) => option.value === filter)) {
      setFilter("all");
    }
  }, [categoryOptions, filter]);

  const updateValue = (
    fileKey: IniFileKey,
    rowSection: string,
    key: string,
    value: string,
    occurrence = 0,
  ) => {
    if (payload === null) return;
    const currentText = textForFile(payload, fileKey);
    const nextText = setIniValue(currentText, rowSection, key, value, occurrence);
    const nextPayload = withFileText(payload, fileKey, nextText);
    setPayload(nextPayload);
    publishDirty(nextPayload, baseline);
    setPreview(null);
  };

  const resetChanges = () => {
    if (baseline === null) return;
    const nextPayload = sanitizeServerIniPayload(baseline);
    setPayload(nextPayload);
    publishDirty(nextPayload, baseline);
    setPreview(null);
    showOperatorToast({
      title: "INI editor",
      message: "Changes discarded.",
    });
  };

  const resetActiveFileToDefaults = () => {
    if (payload === null) return;
    const label =
      activeFileKey === "game" ? "Game.ini" : "GameUserSettings.ini";
    modals.openConfirmModal({
      title: `Reset ${label}`,
      children:
        "Project defaults for this file will be restored. Changes are not written to disk until you click Save.",
      labels: { confirm: "Reset", cancel: "Cancel" },
      confirmProps: { color: "yellow" },
      onConfirm: () => {
        const nextPayload = withFileText(
          payload,
          activeFileKey,
          defaultTextForFile(activeFileKey),
        );
        setPayload(nextPayload);
        publishDirty(nextPayload, baseline);
        setPreview(null);
        showOperatorToast({
          title: "INI editor",
          message: `${label} restored to default (pending save).`,
        });
      },
    });
  };

  const resetRowToDefault = (row: IniSettingReference) => {
    const defaultValue = lookupDefaultValue(row.fileKey, row.section, row.key);
    if (defaultValue === null) return;
    updateValue(row.fileKey, row.section, row.key, defaultValue, row.occurrence);
    showOperatorToast({
      title: "INI editor",
      message: `${row.key} restored to default (pending save).`,
    });
  };

  const toggleSection = (sectionName: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
  };

  const setAllSectionsCollapsed = (collapsed: boolean) => {
    const next: Record<string, boolean> = {};
    for (const group of groupedRows) {
      next[group.category] = collapsed;
    }
    setCollapsedSections(next);
  };

  const saveIni = async (): Promise<boolean> => {
    if (payload === null) return false;
    setBusy(true);
    setError(null);
    return runWithFinally(
      async () => {
        const sanitized = sanitizeServerIniPayload(payload);
        const result = await window.api.saveServerIni(serverId, sanitized);
        if (!result.ok) {
          setError(result.error ?? "Could not save the INI");
          return false;
        }
        setPayload(sanitized);
        setPreview(result.data);
        setBaseline(sanitized);
        publishDirty(sanitized, sanitized);
        showOperatorToast({
          title: "INI saved",
          message:
            result.data.changedCount > 0
              ? `Saved ${result.data.changedCount} change${result.data.changedCount === 1 ? "" : "s"}.`
              : "Saved with no changes.",
        });
        return true;
      },
      () => {
        setBusy(false);
      },
    );
  };

  const saveIniRef = useRef(saveIni);
  useEffect(() => {
    saveIniRef.current = saveIni;
  });

  useEffect(() => {
    onRegisterSave?.(async () => saveIniRef.current());
    return () => onRegisterSave?.(null);
  }, [onRegisterSave]);

  const openExternal = async () => {
    setBusy(true);
    await runWithFinally(
      async () => {
        const result = await window.api.openServerIniInEditor(serverId, activeFileKey);
        if (!result.ok) {
          setError(result.error ?? "Could not open the file");
        }
      },
      () => {
        setBusy(false);
      },
    );
  };

  const filePath =
    snapshot === null
      ? null
      : activeFileKey === "game"
        ? snapshot.gameIniPath
        : snapshot.gameUserSettingsPath;
  const fileLabel =
    activeFileKey === "game" ? "Game.ini" : "GameUserSettings.ini";

  const publishPayloadChange = (nextPayload: ServerIniPayload) => {
    setPayload(nextPayload);
    publishDirty(nextPayload, baseline);
    setPreview(null);
  };

  return {
    snapshot,
    payload,
    loading,
    busy,
    error,
    setError,
    preview,
    search,
    setSearch,
    filter,
    setFilter,
    collapsedSections,
    iniFile,
    setIniFile,
    iniMode,
    setIniMode,
    dirty,
    groupedRows,
    categoryOptions,
    fileLabel,
    filePath,
    updateValue,
    resetChanges,
    resetActiveFileToDefaults,
    resetRowToDefault,
    toggleSection,
    setAllSectionsCollapsed,
    saveIni,
    openExternal,
    publishPayloadChange,
  };
}
