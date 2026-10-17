import { useEffect, useMemo, useRef, useState } from "react";
import { modals } from "@mantine/modals";
import type { IniFileKey, IniPreview, ServerIniPayload, ServerIniSnapshot } from "@shared/types";
import { showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import {
  defaultTextForFile,
  filterIniSettingReferences,
  groupSettingReferencesByUiCategory,
  iniUiSectionCollapseKey,
  parseIniRows,
  removeIniValue,
  sanitizeServerIniPayload,
  setIniValue,
  textForFile,
  withFileText,
  type IniFilterId,
  type IniSettingReference,
} from "../../iniModel";
import { canUnsetIniSetting, lookupVerifiedIniDefault } from "@shared/ini/ini-catalog-relation";
import {
  applyIniRowRevertToPayload,
  buildIniRowMatchIndex,
  countUnsavedIniRowsForFile,
  iniPayloadsDirty,
  isIniRowUnsaved,
  lookupMatchedBaselineValue,
} from "./configurationEditorModel";
import type { ConfigurationEditorApi } from "./configurationEditorTypes";

export function useConfigurationEditor(options: {
  serverId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: (save: (() => Promise<boolean>) | null) => void;
}): ConfigurationEditorApi {
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
  const pendingQueued = snapshot?.pending === true;
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });
  const payloadRef = useRef(payload);
  useEffect(() => {
    payloadRef.current = payload;
  });

  const publishDirty = (nextPayload: ServerIniPayload | null, nextBaseline: ServerIniPayload | null): void => {
    onDirtyChangeRef.current?.(iniPayloadsDirty(nextPayload, nextBaseline));
  };

  const applyLoadedSnapshot = (data: ServerIniSnapshot, options?: { preserveDirty?: boolean }): void => {
    const sanitized = sanitizeServerIniPayload(data.payload);
    const keepDirty = options?.preserveDirty === true && dirtyRef.current && payloadRef.current !== null;
    if (keepDirty && payloadRef.current !== null) {
      // Keep in-editor edits; refresh pending chrome from the push source.
      setSnapshot({ ...data, payload: payloadRef.current });
      return;
    }
    setSnapshot({ ...data, payload: sanitized });
    setPayload(sanitized);
    setBaseline(sanitized);
    setPreview(null);
    publishDirty(sanitized, sanitized);
  };
  const applyLoadedSnapshotRef = useRef(applyLoadedSnapshot);
  useEffect(() => {
    applyLoadedSnapshotRef.current = applyLoadedSnapshot;
  });

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
  const availableRows = useMemo(() => filterIniSettingReferences(rows, "", "all"), [rows]);
  const matchIndex = useMemo(
    () => buildIniRowMatchIndex(payload, baseline, activeFileKey),
    [payload, baseline, activeFileKey],
  );
  const unsavedCounts = useMemo(
    () => countUnsavedIniRowsForFile(payload, matchIndex, activeFileKey),
    [payload, matchIndex, activeFileKey],
  );
  const categoryOptions = useMemo(() => {
    const formatCount = (rowCount: number, unsavedInScope: number): string => {
      if (unsavedInScope <= 0) return String(rowCount);
      return `${rowCount} · ${unsavedInScope} unsaved`;
    };
    return [
      {
        value: "all",
        label: `All settings (${formatCount(availableRows.length, unsavedCounts.file)})`,
      },
      ...groupSettingReferencesByUiCategory(availableRows).map((group) => ({
        value: group.category,
        label: `${group.label} (${formatCount(group.rows.length, unsavedCounts.byCategory.get(group.category) ?? 0)})`,
      })),
    ];
  }, [availableRows, unsavedCounts]);
  const visibleRows = useMemo(() => filterIniSettingReferences(rows, search, filter), [rows, search, filter]);
  const groupedRows = useMemo(() => groupSettingReferencesByUiCategory(visibleRows), [visibleRows]);

  useEffect(() => {
    if (!categoryOptions.some((option) => option.value === filter)) {
      setFilter("all");
    }
  }, [categoryOptions, filter]);

  const updateValue = (fileKey: IniFileKey, rowSection: string, key: string, value: string, occurrence = 0) => {
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
    const label = activeFileKey === "game" ? "Game.ini" : "GameUserSettings.ini";
    modals.openConfirmModal({
      title: `Reset ${label}`,
      children:
        "Project defaults for this file will be restored. Changes are not written to disk until you click Save.",
      labels: { confirm: "Reset", cancel: "Cancel" },
      confirmProps: { color: "attention" },
      onConfirm: () => {
        const nextPayload = withFileText(payload, activeFileKey, defaultTextForFile(activeFileKey));
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

  const applyVerifiedDefault = (row: IniSettingReference) => {
    const verified = lookupVerifiedIniDefault(row.fileKey, row.section, row.key);
    if (verified === null) return;
    updateValue(row.fileKey, row.section, row.key, verified.value, row.occurrence);
    showOperatorToast({
      title: "INI editor",
      message: `${row.key} set to verified default (pending save).`,
    });
  };

  const unsetRow = (row: IniSettingReference) => {
    if (payload === null) return;
    if (!canUnsetIniSetting(row.fileKey, row.section, row.key)) return;
    const nextText = removeIniValue(textForFile(payload, row.fileKey), row.section, row.key, row.occurrence);
    const nextPayload = withFileText(payload, row.fileKey, nextText);
    setPayload(nextPayload);
    publishDirty(nextPayload, baseline);
    setPreview(null);
    showOperatorToast({
      title: "INI editor",
      message: `${row.key} unset (pending save).`,
    });
  };

  const revertRowToSaved = (row: IniSettingReference) => {
    if (payload === null || matchIndex === null) return;
    const { nextPayload, outcome } = applyIniRowRevertToPayload(payload, matchIndex, row);
    setPayload(nextPayload);
    publishDirty(nextPayload, baseline);
    setPreview(null);
    showOperatorToast({
      title: "INI editor",
      message:
        outcome === "discarded" ? `${row.key} discarded (not in saved file).` : `${row.key} reverted to saved value.`,
    });
  };

  const isRowUnsaved = (row: IniSettingReference): boolean => isIniRowUnsaved(row, matchIndex);
  const savedValueForRow = (row: IniSettingReference): string | null =>
    matchIndex === null
      ? null
      : lookupMatchedBaselineValue(matchIndex, row.fileKey, row.section, row.key, row.occurrence);

  const toggleSection = (sectionName: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
  };

  const setSectionGroupsCollapsed = (category: string, collapsed: boolean) => {
    const group = groupedRows.find((item) => item.category === category);
    if (group?.sectionGroups === undefined || group.sectionGroups.length === 0) {
      return;
    }
    setCollapsedSections((prev) => {
      const next = { ...prev };
      for (const sectionGroup of group.sectionGroups ?? []) {
        next[iniUiSectionCollapseKey(group.category, sectionGroup.section)] = collapsed;
      }
      return next;
    });
  };

  const setAllSectionsCollapsed = (collapsed: boolean) => {
    const next: Record<string, boolean> = {};
    for (const group of groupedRows) {
      if (group.sectionGroups !== undefined && group.sectionGroups.length > 0) {
        for (const sectionGroup of group.sectionGroups) {
          next[iniUiSectionCollapseKey(group.category, sectionGroup.section)] = collapsed;
        }
      } else {
        next[group.category] = collapsed;
      }
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
        setSnapshot((prev) =>
          prev === null
            ? prev
            : {
                ...prev,
                payload: sanitized,
                pending: result.data.pending,
                pendingUpdatedAt: result.data.pending ? (prev.pendingUpdatedAt ?? new Date().toISOString()) : null,
              },
        );
        publishDirty(sanitized, sanitized);
        if (result.data.pending) {
          showOperatorToast({
            title: "INI queued",
            message:
              result.data.changedCount > 0
                ? `Queued ${result.data.changedCount} change${result.data.changedCount === 1 ? "" : "s"} — applies when the server stops.`
                : "Queued with no changes — applies when the server stops.",
          });
        } else {
          showOperatorToast({
            title: "INI saved",
            message:
              result.data.changedCount > 0
                ? `Saved ${result.data.changedCount} change${result.data.changedCount === 1 ? "" : "s"}.`
                : "Saved with no changes.",
          });
        }
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
    snapshot === null ? null : activeFileKey === "game" ? snapshot.gameIniPath : snapshot.gameUserSettingsPath;
  const fileLabel = activeFileKey === "game" ? "Game.ini" : "GameUserSettings.ini";

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
    unsavedRowCount: unsavedCounts.file,
    pendingQueued,
    groupedRows,
    categoryOptions,
    fileLabel,
    filePath,
    isRowUnsaved,
    savedValueForRow,
    updateValue,
    resetChanges,
    resetActiveFileToDefaults,
    applyVerifiedDefault,
    unsetRow,
    revertRowToSaved,
    toggleSection,
    setSectionGroupsCollapsed,
    setAllSectionsCollapsed,
    saveIni,
    openExternal,
    publishPayloadChange,
  };
}
