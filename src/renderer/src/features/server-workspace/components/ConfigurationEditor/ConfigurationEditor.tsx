import type { ReactElement } from "react";
import {
  ArrowSquareOut,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Alert,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import type {
  IniFileKey,
  IniPreview,
  ServerIniPayload,
  ServerIniSnapshot,
  ServerProfile,
} from "@shared/types";
import { IniEditorNav } from "@ui/IniEditorNav/IniEditorNav";
import { ConfigurationEditorFilterBar } from "./ConfigurationEditorFilterBar";
import { ConfigurationEditorHeader } from "./ConfigurationEditorHeader";
import { ConfigurationEditorPreviewAlert } from "./ConfigurationEditorPreviewAlert";
import { ConfigurationEditorSettingsTable } from "./ConfigurationEditorSettingsTable";
import { ConfigurationEditorTextPanel } from "./ConfigurationEditorTextPanel";
import { showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUiDensity } from "@app/AppProviders";
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
import classes from "./ConfigurationEditor.module.css";

type ConfigSection = "iniFiles";

interface Props {
  server: ServerProfile;
  /** Active section (controlled by workspace tabs). */
  section: ConfigSection;
  /** Running server or SteamCMD files job. */
  serverActive?: boolean;
  /** SteamCMD job specifically — warning copy. */
  filesJobActive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  /** Workspace leave modal: save INI then continue. */
  onRegisterSave?: (save: (() => Promise<boolean>) | null) => void;
}

function iniPayloadsDirty(
  payload: ServerIniPayload | null,
  baseline: ServerIniPayload | null,
): boolean {
  return (
    payload !== null &&
    baseline !== null &&
    (payload.game !== baseline.game ||
      payload.gameUserSettings !== baseline.gameUserSettings)
  );
}

export function ConfigurationEditor(props: Props): ReactElement {
  const { section, onRegisterSave } = props;
  const filesJobActive = props.filesJobActive === true;
  const density = useUiDensity();
  const openFileIconSize = density === "compact" ? "sm" : "md";
  const openFileGlyphSize = density === "compact" ? 14 : 16;
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
  const onDirtyChangeRef = useRef(props.onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = props.onDirtyChange;
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
    const serverId = props.server.id;

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
        const rawPayload = result.data.payload;
        const sanitized = sanitizeServerIniPayload(rawPayload);
        setSnapshot({ ...result.data, payload: sanitized });
        setPayload(sanitized);
        // ASA may regenerate client sections on start. They are runtime noise:
        // must not appear in the editor or turn a read into a pending change.
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
  }, [props.server.id]);

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
    // Never reintroduce client keys into the editor.
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
      children: (
        <Alert color="yellow" title="Current values will be lost" variant="light">
          Project defaults for this file will be restored. Changes are not
          written to disk until you click Save.
        </Alert>
      ),
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
        const result = await window.api.saveServerIni(props.server.id, sanitized);
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
        const result = await window.api.openServerIniInEditor(props.server.id, activeFileKey);
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

  const openFileAction =
    filePath === null ? null : (
      <Tooltip
        label={
          <div>
            <Text size="xs" fw={600}>
              Open {fileLabel} in the default editor
            </Text>
            <Text size="xs" ff="monospace">
              {filePath}
            </Text>
          </div>
        }
        multiline
        maw={420}
        withArrow
      >
        <span>
          <ActionIcon
            size={openFileIconSize}
            variant="default"
            aria-label={`Open ${fileLabel}`}
            onClick={() => void openExternal()}
            disabled={busy || snapshot === null}
          >
            <ArrowSquareOut size={openFileGlyphSize} />
          </ActionIcon>
        </span>
      </Tooltip>
    );

  const iniNavigation = (
    <IniEditorNav
      file={iniFile}
      onFileChange={setIniFile}
      mode={iniMode}
      onModeChange={(value) => setIniMode(value === "text" ? "text" : "visual")}
      modeOptions={[
        { value: "visual", label: "Visual" },
        { value: "text", label: "Text" },
      ]}
    />
  );

  return (
    <AppSurfaceCard
      tone="flat"
      fill
      padding={0}
      radius="md"
      className={classes.root}
      data-configuration-editor
    >
      <div className={classes.content}>
        {error !== null && (
          <Alert color="red" mb="sm" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}
        {props.serverActive === true && !filesJobActive && (
          <Alert color="yellow" mb="sm" title="Server is running">
            INI changes will apply after the server restarts.
          </Alert>
        )}
        {filesJobActive && (
          <Alert color="yellow" mb="sm" title="Updating server files">
            You can edit INI now. Prefer saving after the file update finishes.
          </Alert>
        )}

        {section === "iniFiles" && iniMode === "visual" && (
          <Stack gap="md" className={classes.editor}>
            <ConfigurationEditorHeader
              fileLabel={fileLabel}
              subtitle="Edit {fileLabel} with visual controls and direct file access."
              openFileAction={openFileAction}
              iniNavigation={iniNavigation}
              showRestoreFile
              restoreFileDisabled={payload === null}
              dirty={dirty}
              busy={busy}
              loading={loading}
              onRestoreFile={resetActiveFileToDefaults}
              onDiscard={resetChanges}
              onSave={() => void saveIni()}
            />

            <ConfigurationEditorFilterBar
              search={search}
              onSearchChange={setSearch}
              filter={filter}
              onFilterChange={setFilter}
              categoryOptions={categoryOptions}
              dirty={dirty}
              onCollapseAll={() => setAllSectionsCollapsed(true)}
              onExpandAll={() => setAllSectionsCollapsed(false)}
            />

            <ConfigurationEditorSettingsTable
              loading={loading}
              groupedRows={groupedRows}
              collapsedSections={collapsedSections}
              busy={busy}
              onToggleSection={toggleSection}
              onUpdateValue={updateValue}
              onResetRowToDefault={resetRowToDefault}
            />

            <Group justify="space-between" className={classes.footer}>
              <Text c="dimmed" size="xs">
                The manager only handles settings that apply to the dedicated server.
              </Text>
            </Group>

            {preview !== null && preview.diff.length > 0 && (
              <ConfigurationEditorPreviewAlert preview={preview} />
            )}
          </Stack>
        )}

        {section === "iniFiles" && iniMode === "text" && payload !== null && (
          <Stack gap="md" className={classes.editor}>
            <ConfigurationEditorHeader
              fileLabel={fileLabel}
              subtitle="Direct editing of {fileLabel}. Useful for comparing or pasting blocks between servers."
              openFileAction={openFileAction}
              iniNavigation={iniNavigation}
              dirty={dirty}
              busy={busy}
              onDiscard={resetChanges}
              onSave={() => void saveIni()}
            />
            <ConfigurationEditorTextPanel
              iniFile={iniFile}
              payload={payload}
              onPayloadChange={(nextPayload) => {
                setPayload(nextPayload);
                publishDirty(nextPayload, baseline);
              }}
            />
          </Stack>
        )}
      </div>
    </AppSurfaceCard>
  );
}
