import { useEffect, useMemo, useRef, useState } from "react";
import { modals } from "@mantine/modals";
import type { NamedEngramEdit } from "@shared/ini/engram-named-entries";
import { iniFingerprintsMatch } from "@shared/ini/ini-fingerprints";
import { isPlayerLevelEngramPointsKey } from "@shared/ini/player-level-engram-points";
import type { IniFileKey, IniPreview, ServerIniPayload, ServerIniSnapshot } from "@shared/types";
import { showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import {
  defaultTextForFile,
  filterIniSettingReferences,
  groupSettingReferencesByUiCategory,
  iniUiSectionCollapseKey,
  lookupDefaultValue,
  parseIniRows,
  sanitizeServerIniPayload,
  setIniValue,
  textForFile,
  withFileText,
  type IniFilterId,
  type IniSettingReference,
} from "../../iniModel";
import {
  applyIniRowRevertToPayload,
  buildIniRowMatchIndex,
  countUnsavedIniRowsForFile,
  iniPayloadsDirty,
  isIniRowUnsaved,
  lookupMatchedBaselineValue,
} from "./configurationEditorModel";
import { configurationEditorSaveToastMessage, performConfigurationEditorSave } from "./configurationEditorSave";
import type { ConfigurationEditorApi } from "./configurationEditorTypes";
import { useConfigurationEditorDiskSync } from "./useConfigurationEditorDiskSync";

export function useConfigurationEditor(options: {
  serverId: string;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: (save: (() => Promise<boolean>) | null) => void;
  engramEditsRef?: { readonly current: readonly NamedEngramEdit[] };
  engramBlockedRef?: { readonly current: boolean };
  saveScopeRef?: {
    readonly current: "gameUserSettings" | "gameSettings" | "engramPoints" | "engramOverrides" | "gameText";
  };
  onEngramDraftsReset?: () => void;
}): ConfigurationEditorApi {
  const { serverId, onRegisterSave } = options;
  const [snapshot, setSnapshot] = useState<ServerIniSnapshot | null>(null);
  const [payload, setPayload] = useState<ServerIniPayload | null>(null);
  const [baseline, setBaseline] = useState<ServerIniPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleDocument, setStaleDocument] = useState(false);
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
    const engramPending =
      (options.engramEditsRef?.current.length ?? 0) > 0 || options.engramBlockedRef?.current === true;
    dirtyRef.current = dirty || engramPending;
  });
  const payloadRef = useRef(payload);
  useEffect(() => {
    payloadRef.current = payload;
  });
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  });
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  });
  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  });

  const publishDirty = (nextPayload: ServerIniPayload | null, nextBaseline: ServerIniPayload | null): void => {
    onDirtyChangeRef.current?.(iniPayloadsDirty(nextPayload, nextBaseline));
  };

  const applyLoadedSnapshotRef = useRef<(data: ServerIniSnapshot, options?: { preserveDirty?: boolean }) => void>(
    () => undefined,
  );

  const diskSync = useConfigurationEditorDiskSync({
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
  });

  const applyLoadedSnapshot = (data: ServerIniSnapshot, loadOptions?: { preserveDirty?: boolean }): void => {
    const sanitized = sanitizeServerIniPayload(data.payload);
    const keepDirty = loadOptions?.preserveDirty === true && dirtyRef.current && payloadRef.current !== null;
    if (keepDirty && payloadRef.current !== null) {
      // Keep in-editor edits and the Save baseline fingerprints. Advancing
      // fingerprints here would let Save overwrite the external change (#665).
      const previous = snapshotRef.current;
      const baselineFingerprints = previous?.fingerprints ?? data.fingerprints;
      setSnapshot({
        ...data,
        payload: payloadRef.current,
        fingerprints: baselineFingerprints,
      });
      if (!iniFingerprintsMatch(baselineFingerprints, data.fingerprints)) {
        diskSync.setExternalDiskPayload(sanitized);
        diskSync.setExternalChangeDetected(true);
      } else {
        // Disk restored to the Save baseline — clear a stale outside-change banner (#667).
        diskSync.clearExternalChangeFlags();
      }
      return;
    }
    setSnapshot({ ...data, payload: sanitized });
    setPayload(sanitized);
    setBaseline(sanitized);
    setPreview(null);
    diskSync.clearExternalChangeFlags();
    options.onEngramDraftsReset?.();
    publishDirty(sanitized, sanitized);
  };
  useEffect(() => {
    applyLoadedSnapshotRef.current = applyLoadedSnapshot;
  });

  const activeFileKey = iniFile;
  const activeText = payload !== null ? textForFile(payload, activeFileKey) : "";
  const rows = useMemo<IniSettingReference[]>(
    () =>
      parseIniRows(activeText)
        .filter((row) => !isPlayerLevelEngramPointsKey(row.key))
        .map((row) => ({
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
    options.onEngramDraftsReset?.();
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

  const resetRowToDefault = (row: IniSettingReference) => {
    const defaultValue = lookupDefaultValue(row.fileKey, row.section, row.key);
    if (defaultValue === null) return;
    updateValue(row.fileKey, row.section, row.key, defaultValue, row.occurrence);
    showOperatorToast({
      title: "INI editor",
      message: `${row.key} restored to default (pending save).`,
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
    if (payload === null || snapshot === null || baseline === null) return false;
    setBusy(true);
    setError(null);
    setStaleDocument(false);
    diskSync.setExternalChangeDetected(false);
    return runWithFinally(
      async () => {
        const outcome = await performConfigurationEditorSave({
          serverId,
          mode: iniMode,
          draft: payload,
          baseline,
          expectedFingerprints: snapshot.fingerprints,
          scope: options.saveScopeRef?.current,
          engramEdits: iniMode === "visual" ? (options.engramEditsRef?.current ?? []) : [],
          engramBlocked: options.engramBlockedRef?.current === true,
        });
        if (!outcome.ok) {
          setError(outcome.error);
          setStaleDocument(outcome.conflict);
          if (outcome.conflict && iniMode === "visual") {
            // Capture current disk so the outside-changes popover has real details (#667).
            const latest = await window.api.readServerIni(serverId);
            if (latest.ok) {
              diskSync.setExternalDiskPayload(sanitizeServerIniPayload(latest.data.payload));
            }
            diskSync.setExternalChangeDetected(true);
          }
          return false;
        }

        const { savedPayload, draftPayload, resetEngrams, preview, fingerprints, pending, changedCount } = outcome;
        setPayload(draftPayload);
        setPreview(preview);
        setBaseline(savedPayload);
        if (resetEngrams) options.onEngramDraftsReset?.();
        diskSync.setExternalChangeDetected(false);
        setSnapshot((prev) =>
          prev === null
            ? prev
            : {
                ...prev,
                payload: savedPayload,
                fingerprints,
                pending,
                pendingUpdatedAt: pending ? (prev.pendingUpdatedAt ?? new Date().toISOString()) : null,
              },
        );
        publishDirty(draftPayload, savedPayload);
        showOperatorToast(configurationEditorSaveToastMessage(pending, changedCount));
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
    baseline,
    loading,
    busy,
    error,
    setError: (next: string | null) => {
      setError(next);
      if (next === null) {
        setStaleDocument(false);
      }
    },
    staleDocument,
    externalChangeDetected: diskSync.externalChangeDetected,
    setExternalChangeDetected: diskSync.setExternalChangeDetected,
    externalDiskPayload: diskSync.externalDiskPayload,
    reloadFromDisk: diskSync.reloadFromDisk,
    requestReloadFromDisk: diskSync.requestReloadFromDisk,
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
    resetRowToDefault,
    revertRowToSaved,
    toggleSection,
    setSectionGroupsCollapsed,
    setAllSectionsCollapsed,
    saveIni,
    openExternal,
    publishPayloadChange,
  };
}
