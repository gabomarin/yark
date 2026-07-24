import {
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  FloppyDisk,
  MagnifyingGlass,
  ArrowCounterClockwise,
  ArrowUUpLeft,
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
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { applyIniPreset, listIniPresets } from "@shared/ini-presets";
import type {
  IniFileKey,
  IniPreview,
  ServerIniPayload,
  ServerIniSnapshot,
  ServerProfile,
} from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import {
  INI_FILTERS,
  defaultTextForFile,
  filterIniRows,
  groupRowsByUiCategory,
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
  type IniSettingRow,
} from "../iniModel";
import classes from "./ConfigurationEditor.module.css";

export type ConfigSection =
  | "game"
  | "gameUserSettings"
  | "mods"
  | "advanced";

interface Props {
  server: ServerProfile;
  /** Sección activa (controlada por los tabs del workspace). */
  section: ConfigSection;
  serverActive?: boolean;
  onModsChanged: (mods: string[]) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ConfigurationEditor(props: Props): JSX.Element {
  const { section } = props;
  const [snapshot, setSnapshot] = useState<ServerIniSnapshot | null>(null);
  const [payload, setPayload] = useState<ServerIniPayload | null>(null);
  const [baseline, setBaseline] = useState<ServerIniPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<IniPreview | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<IniFilterId>("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [advancedFile, setAdvancedFile] = useState<IniFileKey>("gameUserSettings");
  const [modDraft, setModDraft] = useState("");
  const [mods, setMods] = useState<string[]>(props.server.mods);

  const dirty =
    payload !== null &&
    baseline !== null &&
    (payload.game !== baseline.game ||
      payload.gameUserSettings !== baseline.gameUserSettings);

  useEffect(() => {
    props.onDirtyChange?.(dirty);
  }, [dirty, props.onDirtyChange]);

  useEffect(() => {
    setMods(props.server.mods);
  }, [props.server.id, props.server.mods]);

  const load = async (serverId: string) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    setPreview(null);
    const result = await window.api.readServerIni(serverId);
    setLoading(false);
    if (!result.ok) {
      setSnapshot(null);
      setPayload(null);
      setBaseline(null);
      setError(result.error ?? "No se pudo leer el INI");
      return;
    }
    const rawPayload = result.data.payload;
    const sanitized = sanitizeServerIniPayload(rawPayload);
    setSnapshot({ ...result.data, payload: sanitized });
    setPayload(sanitized);
    // Si el disco tenía keys de cliente, dejamos dirty para que Save las limpie.
    setBaseline(rawPayload);
    if (
      sanitized.gameUserSettings !== rawPayload.gameUserSettings ||
      sanitized.game !== rawPayload.game
    ) {
      setInfo(
        "Se detectaron claves de cliente o historial (p. ej. LastJoinedSessionPerCategory). No se aplican al servidor dedicado: pulsa Guardar para limpiarlas del disco.",
      );
    }
  };

  useEffect(() => {
    void load(props.server.id);
  }, [props.server.id]);

  const activeFileKey: IniFileKey =
    section === "advanced"
      ? advancedFile
      : section === "game"
        ? "game"
        : "gameUserSettings";

  const activeText = payload !== null ? textForFile(payload, activeFileKey) : "";
  const rows = useMemo(() => parseIniRows(activeText), [activeText]);
  const visibleRows = useMemo(
    () => filterIniRows(rows, search, filter, activeFileKey),
    [rows, search, filter, activeFileKey],
  );
  const groupedRows = useMemo(
    () => groupRowsByUiCategory(visibleRows, activeFileKey),
    [visibleRows, activeFileKey],
  );

  const updateValue = (
    rowSection: string,
    key: string,
    value: string,
    occurrence = 0,
  ) => {
    if (payload === null) return;
    const nextText = setIniValue(activeText, rowSection, key, value, occurrence);
    setPayload(withFileText(payload, activeFileKey, nextText));
    setInfo(null);
    setPreview(null);
  };

  const resetChanges = () => {
    if (baseline === null) return;
    // Nunca reintroducir keys de cliente en el editor.
    setPayload(sanitizeServerIniPayload(baseline));
    setPreview(null);
    setInfo("Cambios descartados");
  };

  const resetActiveFileToDefaults = () => {
    if (payload === null) return;
    const label =
      activeFileKey === "game" ? "Game.ini" : "GameUserSettings.ini";
    modals.openConfirmModal({
      title: `Restablecer ${label}`,
      children: (
        <Alert color="yellow" title="Se perderán valores actuales" variant="light">
          Se restaurarán los defaults del proyecto para este archivo. Los cambios no se
          escriben en disco hasta que pulses Guardar.
        </Alert>
      ),
      labels: { confirm: "Restablecer", cancel: "Cancelar" },
      confirmProps: { color: "yellow" },
      onConfirm: () => {
        setPayload(withFileText(payload, activeFileKey, defaultTextForFile(activeFileKey)));
        setPreview(null);
        setInfo(`${label} restaurado a valores predeterminados (pendiente de guardar)`);
      },
    });
  };

  const resetRowToDefault = (row: IniSettingRow) => {
    const defaultValue = lookupDefaultValue(activeFileKey, row.section, row.key);
    if (defaultValue === null) return;
    updateValue(row.section, row.key, defaultValue, row.occurrence);
    setInfo(`${row.key} restaurado al default`);
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

  const saveIni = async () => {
    if (payload === null) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const sanitized = sanitizeServerIniPayload(payload);
    const result = await window.api.saveServerIni(props.server.id, sanitized);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo guardar el INI");
      return;
    }
    setPayload(sanitized);
    setPreview(result.data);
    setBaseline(sanitized);
    setInfo(
      result.data.changedCount > 0
        ? `Guardado (${result.data.changedCount} cambios)`
        : "Guardado (sin cambios)",
    );
  };

  const openExternal = async () => {
    setBusy(true);
    const result = await window.api.openServerIniInEditor(props.server.id, activeFileKey);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo abrir el archivo");
    }
  };

  const applyPreset = (presetId: string | null) => {
    if (payload === null || presetId === null) return;
    const next = applyIniPreset(payload, presetId);
    setPayload(next);
    setInfo(`Preset aplicado: ${presetId}`);
    setPreview(null);
  };

  const saveMods = async (nextMods: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await props.onModsChanged(nextMods);
      setMods(nextMods);
      setInfo("Mods actualizados en el perfil");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar los mods");
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
              Abrir {fileLabel} en el editor predeterminado
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
            size="md"
            variant="default"
            aria-label={`Abrir ${fileLabel}`}
            onClick={() => void openExternal()}
            disabled={busy || snapshot === null}
          >
            <ArrowSquareOut size={16} />
          </ActionIcon>
        </span>
      </Tooltip>
    );

  return (
    <div className={classes.root} data-configuration-editor>
      <div className={classes.content}>
        {error !== null && (
          <Alert color="red" mb="sm" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}
        {info !== null && (
          <Alert color="blue" mb="sm" onClose={() => setInfo(null)} withCloseButton>
            {info}
          </Alert>
        )}
        {props.serverActive === true && section !== "mods" && (
          <Alert color="yellow" mb="sm" title="Servidor en ejecución">
            Los cambios en INI se aplicarán al reiniciar el servidor.
          </Alert>
        )}

        {(section === "game" || section === "gameUserSettings") && (
          <Stack gap="md" className={classes.editor}>
            <Group justify="space-between" align="flex-start">
              <div>
                <Group gap="xs" wrap="nowrap">
                  <Title order={3}>
                    Editar {section === "game" ? "Game.ini" : "GameUserSettings.ini"}
                  </Title>
                  {openFileAction}
                </Group>
                <Text c="dimmed" size="sm">
                  Ajustes agrupados por categoría. Busca o utiliza los filtros para acotar resultados.
                </Text>
              </div>
              <Group gap="xs">
                <Select
                  size="xs"
                  placeholder="Aplicar preset"
                  data={listIniPresets().map((preset) => ({
                    value: preset.id,
                    label: preset.name,
                  }))}
                  clearable
                  searchable
                  w={160}
                  onChange={applyPreset}
                  disabled={payload === null || loading}
                />
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<ArrowUUpLeft size={16} />}
                  onClick={resetActiveFileToDefaults}
                  disabled={payload === null || busy || loading}
                >
                  Restaurar valores
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<ArrowCounterClockwise size={16} />}
                  onClick={resetChanges}
                  disabled={!dirty || busy}
                >
                  Descartar cambios
                </Button>
                <Button
                  size="xs"
                  leftSection={<FloppyDisk size={16} />}
                  onClick={() => void saveIni()}
                  disabled={!dirty || busy || loading}
                >
                  Guardar
                </Button>
              </Group>
            </Group>

            <Group gap="sm" align="center">
              <TextInput
                className={classes.search}
                placeholder="Buscar ajustes"
                leftSection={<MagnifyingGlass size={14} />}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
              <Button size="xs" variant="light" onClick={() => setAllSectionsCollapsed(true)}>
                Colapsar
              </Button>
              <Button size="xs" variant="light" onClick={() => setAllSectionsCollapsed(false)}>
                Expandir
              </Button>
              {dirty && (
                <Badge color="yellow" variant="light">
                  Sin guardar
                </Badge>
              )}
            </Group>

            <Group gap={6} className={classes.filters}>
              {INI_FILTERS.map((item) => (
                <Button
                  key={item.id}
                  size="xs"
                  variant={filter === item.id ? "filled" : "light"}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </Group>

            <div className={classes.tableWrap}>
              <div className={classes.tableHead}>
                <span>Ajuste</span>
                <span>Valor</span>
                <span>Descripción</span>
                <span />
              </div>
              <div className={classes.tableBody} data-ini-settings-scroll>
                {loading && (
                  <Text c="dimmed" p="md">
                    Cargando INI…
                  </Text>
                )}
                {!loading && groupedRows.length === 0 && (
                  <Text c="dimmed" p="md">
                    No hay settings para este filtro.
                  </Text>
                )}
                {!loading &&
                  groupedRows.map((group) => {
                    const collapsed = collapsedSections[group.category] === true;
                    return (
                      <div key={group.category} className={classes.sectionBlock}>
                        <UnstyledButton
                          className={classes.sectionHeader}
                          onClick={() => toggleSection(group.category)}
                        >
                          <Group gap="xs" wrap="nowrap">
                            {collapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
                            <Text fw={700} size="sm">
                              {group.label}
                            </Text>
                            <Badge size="xs" variant="light" color="gray">
                              {group.rows.length}
                            </Badge>
                          </Group>
                          <Text c="dimmed" size="xs" className={classes.sectionPath}>
                            Categoría UI
                          </Text>
                        </UnstyledButton>

                        {!collapsed &&
                          group.rows.map((row) => {
                            const kind = resolveControlKind(row.value, {
                              fileKey: activeFileKey,
                              section: row.section,
                              key: row.key,
                            });
                            const controlId = `${row.section}\u001f${row.key}\u001f${row.occurrence}`;
                            const defaultValue = lookupDefaultValue(
                              activeFileKey,
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
                                          row.section,
                                          row.key,
                                          event.currentTarget.checked ? "True" : "False",
                                          row.occurrence,
                                        )
                                      }
                                    />
                                  ) : kind === "number" ? (
                                    <NumberInput
                                      value={Number(row.value)}
                                      onChange={(value) =>
                                        updateValue(
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
                                  {lookupSettingDescription(activeFileKey, row.section, row.key)}
                                </Text>
                                <div className={classes.rowActions}>
                                  <Tooltip
                                    label={
                                      canResetDefault
                                        ? `Default: ${defaultValue}`
                                        : "Sin default conocido para esta key/sección"
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
                Guardar escribe el archivo indicado y elimina claves de cliente incompatibles.
              </Text>
            </Group>

            {preview !== null && preview.diff.length > 0 && (
              <Alert color="green" title="Último diff guardado">
                {preview.diff.slice(0, 8).map((entry) => (
                  <Text key={`${entry.fileKey}.${entry.section}.${entry.key}`} size="sm">
                    [{entry.fileKey}] {entry.section}.{entry.key}: {entry.before ?? "∅"} →{" "}
                    {entry.after ?? "∅"}
                  </Text>
                ))}
                {preview.diff.length > 8 && (
                  <Text size="sm" c="dimmed">
                    …y {preview.diff.length - 8} más
                  </Text>
                )}
              </Alert>
            )}
          </Stack>
        )}

        {section === "mods" && (
          <Stack gap="md">
            <div>
              <Title order={3}>Mods activos ({mods.length})</Title>
              <Text c="dimmed" size="sm">
                Orden de carga del perfil. La integración automática utilizará CurseForge para ASA.
              </Text>
            </div>
            <Group align="flex-end">
              <TextInput
                label="Mod ID"
                placeholder="1234567890"
                value={modDraft}
                onChange={(event) => setModDraft(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                disabled={modDraft.trim().length === 0 || busy}
                onClick={() => {
                  const id = modDraft.trim();
                  if (id.length === 0) return;
                  const next = mods.includes(id) ? mods : [...mods, id];
                  setModDraft("");
                  void saveMods(next);
                }}
              >
                Añadir mod
              </Button>
            </Group>
            <Stack gap="xs">
              {mods.length === 0 && (
                <Text c="dimmed" size="sm">
                  No hay mods configurados.
                </Text>
              )}
              {mods.map((modId, index) => (
                <Group key={`${modId}-${index}`} className={classes.modRow} justify="space-between">
                  <div>
                    <Text fw={600}>{modId}</Text>
                    <Text c="dimmed" size="xs">
                      Orden de carga #{index + 1}
                    </Text>
                  </div>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      disabled={index === 0 || busy}
                      onClick={() => {
                        if (index === 0) return;
                        const next = [...mods];
                        const current = next[index];
                        const prev = next[index - 1];
                        if (current === undefined || prev === undefined) return;
                        next[index - 1] = current;
                        next[index] = prev;
                        void saveMods(next);
                      }}
                    >
                      Subir
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      disabled={index === mods.length - 1 || busy}
                      onClick={() => {
                        if (index >= mods.length - 1) return;
                        const next = [...mods];
                        const current = next[index];
                        const following = next[index + 1];
                        if (current === undefined || following === undefined) return;
                        next[index] = following;
                        next[index + 1] = current;
                        void saveMods(next);
                      }}
                    >
                      Bajar
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      disabled={busy}
                      onClick={() => {
                        void saveMods(mods.filter((_, i) => i !== index));
                      }}
                    >
                      Eliminar
                    </Button>
                  </Group>
                </Group>
              ))}
            </Stack>
          </Stack>
        )}

        {section === "advanced" && payload !== null && (
          <Stack gap="md" className={classes.editor}>
            <Group justify="space-between">
              <div>
                <Group gap="xs" wrap="nowrap">
                  <Title order={3}>Avanzado (INI sin procesar)</Title>
                  {openFileAction}
                </Group>
                <Text c="dimmed" size="sm">
                  Edición directa del texto. Útil para comparar o pegar bloques entre servidores.
                </Text>
              </div>
              <Group gap="xs">
                <Select
                  value={advancedFile}
                  onChange={(value) => {
                    if (value === "game" || value === "gameUserSettings") {
                      setAdvancedFile(value);
                    }
                  }}
                  data={[
                    { value: "gameUserSettings", label: "GameUserSettings.ini" },
                    { value: "game", label: "Game.ini" },
                  ]}
                  w={220}
                />
                <Button
                  variant="default"
                  leftSection={<ArrowCounterClockwise size={16} />}
                  onClick={resetChanges}
                  disabled={!dirty || busy}
                >
                  Descartar cambios
                </Button>
                <Button
                  leftSection={<FloppyDisk size={16} />}
                  onClick={() => void saveIni()}
                  disabled={!dirty || busy}
                >
                  Guardar
                </Button>
              </Group>
            </Group>
            <Textarea
              className={classes.rawEditor}
              minRows={22}
              value={textForFile(payload, advancedFile)}
              onChange={(event) =>
                setPayload(withFileText(payload, advancedFile, event.currentTarget.value))
              }
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
    </div>
  );
}
