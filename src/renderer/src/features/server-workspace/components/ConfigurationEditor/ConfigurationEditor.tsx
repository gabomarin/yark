import type { ReactElement } from "react";
import {
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  FloppyDisk,
  ArrowCounterClockwise,
  ArrowUUpLeft,
  FunnelSimple,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
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
import chrome from "@ui/IniEditorChrome/IniEditorChrome.module.css";
import { SearchField } from "@ui/SearchField/SearchField";
import { showOperatorToast } from "@ui/operatorToast";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUiDensity } from "@app/AppProviders";
import {
  defaultTextForFile,
  filterIniSettingReferences,
  groupSettingReferencesByUiCategory,
  lookupDefaultValue,
  lookupSettingDescription,
  parseIniRows,
  resolveControlKind,
  sanitizeServerIniPayload,
  sectionShortName,
  setIniValue,
  textForFile,
  withFileText,
  type IniFilterId,
  type IniSettingReference,
} from "../../iniModel";
import { numberInputValueFromIni } from "../../iniNumberInput";
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

    void (async () => {
      try {
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
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

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
    try {
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
    } finally {
      setBusy(false);
    }
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
    try {
      const result = await window.api.openServerIniInEditor(props.server.id, activeFileKey);
      if (!result.ok) {
        setError(result.error ?? "Could not open the file");
      }
    } finally {
      setBusy(false);
    }
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
            <Stack gap="sm">
              <div>
                <Group gap="xs" wrap="nowrap">
                  <Title order={3}>
                    INI Files
                  </Title>
                  {openFileAction}
                </Group>
                <Text c="dimmed" size="sm">
                  Edit {fileLabel} with visual controls and direct file access.
                </Text>
              </div>
              <div className={classes.headerToolbar}>
                {iniNavigation}
                <Group gap="xs" className={classes.headerActions} wrap="wrap">
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<ArrowUUpLeft size={16} />}
                    onClick={resetActiveFileToDefaults}
                    disabled={payload === null || busy || loading}
                  >
                    Restore file
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<ArrowCounterClockwise size={16} />}
                    onClick={resetChanges}
                    disabled={!dirty || busy}
                  >
                    Discard changes
                  </Button>
                  <Button
                    size="xs"
                    leftSection={<FloppyDisk size={16} />}
                    onClick={() => void saveIni()}
                    disabled={!dirty || busy || loading}
                  >
                    Save
                  </Button>
                </Group>
              </div>
            </Stack>

            <Group gap="sm" align="center" className={classes.filterBar}>
              <SearchField
                className={classes.search}
                size="xs"
                placeholder="Search settings"
                label="Search settings"
                value={search}
                onChange={setSearch}
              />
              <Select
                className={classes.categorySelect}
                aria-label="Filter by category"
                leftSection={<FunnelSimple size={15} />}
                value={filter}
                data={categoryOptions}
                searchable
                allowDeselect={false}
                nothingFoundMessage="No categories"
                onChange={(value) => setFilter((value ?? "all") as IniFilterId)}
              />
              <Button size="xs" variant="light" onClick={() => setAllSectionsCollapsed(true)}>
                Collapse
              </Button>
              <Button size="xs" variant="light" onClick={() => setAllSectionsCollapsed(false)}>
                Expand
              </Button>
              {dirty && (
                <Badge color="yellow" variant="light">
                  Unsaved
                </Badge>
              )}
            </Group>

            <div className={classes.tableWrap}>
              <div className={classes.tableHead}>
                <span>Setting</span>
                <span>Value</span>
                <span>Description</span>
                <span />
              </div>
              <div className={classes.tableBody} data-ini-settings-scroll>
                {loading && (
                  <Text c="dimmed" p="md">
                    Loading INI…
                  </Text>
                )}
                {!loading && groupedRows.length === 0 && (
                  <Text c="dimmed" p="md">
                    No settings match this filter.
                  </Text>
                )}
                {!loading &&
                  groupedRows.map((group) => {
                    const collapsed = collapsedSections[group.category] === true;
                    return (
                      <div key={group.category} className={classes.sectionBlock}>
                        <button
                          type="button"
                          className={chrome.sectionHeader}
                          aria-expanded={!collapsed}
                          onClick={() => toggleSection(group.category)}
                        >
                          <Group gap="xs" wrap="nowrap">
                            {collapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
                            <Text fw={700} size="sm" className={chrome.sectionHeaderLabel}>
                              {group.label}
                            </Text>
                            <Badge size="xs" variant="outline" className={chrome.sectionCount}>
                              {group.rows.length}
                            </Badge>
                          </Group>
                        </button>

                        {!collapsed &&
                          group.rows.map((row) => {
                            const kind = resolveControlKind(row.value, {
                              fileKey: row.fileKey,
                              section: row.section,
                              key: row.key,
                            });
                            const controlId = `${row.fileKey}\u001f${row.section}\u001f${row.key}\u001f${row.occurrence}`;
                            const defaultValue = lookupDefaultValue(
                              row.fileKey,
                              row.section,
                              row.key,
                            );
                            const canResetDefault =
                              defaultValue !== null && defaultValue !== row.value;
                            const label =
                              row.duplicateCount > 1
                                ? `${row.key} #${row.occurrence + 1}`
                                : row.key;

                            return (
                              <div key={controlId} className={classes.row}>
                                <div>
                                  <Text fw={600} size="sm">
                                    {label}
                                  </Text>
                                  <Text c="dimmed" size="xs">
                                    {sectionShortName(row.section)}
                                    {row.duplicateCount > 1
                                      ? ` · ${row.occurrence + 1}/${row.duplicateCount}`
                                      : ""}
                                  </Text>
                                </div>
                                <div>
                                  {kind === "boolean" ? (
                                    <Switch
                                      checked={row.value.toLowerCase() === "true"}
                                      onChange={(event) =>
                                        updateValue(
                                          row.fileKey,
                                          row.section,
                                          row.key,
                                          event.currentTarget.checked ? "True" : "False",
                                          row.occurrence,
                                        )
                                      }
                                    />
                                  ) : kind === "number" ? (
                                    <NumberInput
                                      value={numberInputValueFromIni(row.value)}
                                      onChange={(value) =>
                                        updateValue(
                                          row.fileKey,
                                          row.section,
                                          row.key,
                                          value === "" || value === undefined
                                            ? ""
                                            : String(value),
                                          row.occurrence,
                                        )
                                      }
                                      decimalScale={4}
                                      hideControls={false}
                                    />
                                  ) : (
                                    <TextInput
                                      value={row.value}
                                      onChange={(event) =>
                                        updateValue(
                                          row.fileKey,
                                          row.section,
                                          row.key,
                                          event.currentTarget.value,
                                          row.occurrence,
                                        )
                                      }
                                    />
                                  )}
                                </div>
                                <Text c="dimmed" size="sm">
                                  {lookupSettingDescription(
                                    row.fileKey,
                                    row.section,
                                    row.key,
                                  )}
                                </Text>
                                <div className={classes.rowActions}>
                                  <Tooltip
                                    label={
                                      canResetDefault
                                        ? `Default: ${defaultValue}`
                                        : "No known default for this key/section"
                                    }
                                  >
                                    <ActionIcon
                                      variant="subtle"
                                      color="gray"
                                      disabled={!canResetDefault || busy}
                                      aria-label={`Reset ${row.key} to default`}
                                      onClick={() => resetRowToDefault(row)}
                                    >
                                      <ArrowUUpLeft size={14} />
                                    </ActionIcon>
                                  </Tooltip>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
              </div>
            </div>

            <Group justify="space-between" className={classes.footer}>
              <Text c="dimmed" size="xs">
                The manager only handles settings that apply to the dedicated server.
              </Text>
            </Group>

            {preview !== null && preview.diff.length > 0 && (
              <Alert color="blue" title="Last saved diff">
                {preview.diff.slice(0, 8).map((entry) => (
                  <Text key={`${entry.fileKey}.${entry.section}.${entry.key}`} size="sm">
                    [{entry.fileKey}] {entry.section}.{entry.key}: {entry.before ?? "∅"} →{" "}
                    {entry.after ?? "∅"}
                  </Text>
                ))}
                {preview.diff.length > 8 && (
                  <Text size="sm" c="dimmed">
                    …and {preview.diff.length - 8} more
                  </Text>
                )}
              </Alert>
            )}
          </Stack>
        )}

        {section === "iniFiles" && iniMode === "text" && payload !== null && (
          <Stack gap="md" className={classes.editor}>
            <Stack gap="sm">
              <div>
                <Group gap="xs" wrap="nowrap">
                  <Title order={3}>INI Files</Title>
                  {openFileAction}
                </Group>
                <Text c="dimmed" size="sm">
                  Direct editing of {fileLabel}. Useful for comparing or pasting blocks between servers.
                </Text>
              </div>
              <div className={classes.headerToolbar}>
                {iniNavigation}
                <Group gap="xs" className={classes.headerActions} wrap="wrap">
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<ArrowCounterClockwise size={16} />}
                    onClick={resetChanges}
                    disabled={!dirty || busy}
                  >
                    Discard changes
                  </Button>
                  <Button
                    size="xs"
                    leftSection={<FloppyDisk size={16} />}
                    onClick={() => void saveIni()}
                    disabled={!dirty || busy}
                  >
                    Save
                  </Button>
                </Group>
              </div>
            </Stack>
            {iniFile === "gameUserSettings" && (
              <Alert color="blue" variant="light" title="Server settings override">
                Session name, ports, and passwords come from the{" "}
                <strong>Server</strong> tab and are rewritten on start. ASA
                ignores INI <code>MaxPlayers</code> – set{" "}
                <strong>Max players</strong> there for{" "}
                <code>-WinLiveMaxPlayers</code> (empty or <code>0</code> omits
                the flag; ASA then defaults to 70).
              </Alert>
            )}
            <Textarea
              className={classes.rawEditor}
              minRows={22}
              value={textForFile(payload, iniFile)}
              onChange={(event) => {
                const nextPayload = withFileText(
                  payload,
                  iniFile,
                  event.currentTarget.value,
                );
                setPayload(nextPayload);
                publishDirty(nextPayload, baseline);
              }}
              styles={{
                input: {
                  fontFamily: "Consolas, 'Courier New', monospace",
                  fontSize: 12,
                },
              }}
            />
          </Stack>
        )}
      </div>
    </AppSurfaceCard>
  );
}
