import { useEffect, useMemo, useState } from "react";
import { applyIniPreset, listIniPresets } from "@shared/ini-presets";
import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import type { IniPreview, ServerIniPayload, ServerProfile, ServerIniSnapshot } from "@shared/types";

interface Props {
  server: ServerProfile;
  onBack: () => void;
}

function emptyPayload(): ServerIniPayload {
  return { gameUserSettings: "", game: "" };
}

type TabKey = "gameUserSettings" | "game";

interface IniDoc {
  sectionOrder: string[];
  keyOrderBySection: Map<string, string[]>;
  valuesBySection: Map<string, Map<string, string>>;
}

interface VisualSettingRow {
  section: string;
  key: string;
  value: string;
  defaultValue: string;
  isCustom: boolean;
}

interface SectionGroup {
  section: string;
  rows: VisualSettingRow[];
}

const TAB_LABELS: Record<TabKey, string> = {
  gameUserSettings: "GameUserSettings",
  game: "Game",
};

const DEFAULT_SECTION_BY_TAB: Record<TabKey, string> = {
  gameUserSettings: "ServerSettings",
  game: "/Script/ShooterGame.ShooterGameMode",
};

const defaultDocsByTab: Record<TabKey, IniDoc> = {
  gameUserSettings: parseIniDoc(defaultGameUserSettingsIni),
  game: parseIniDoc(defaultGameIni),
};

function sectionKeyLookup(section: string, key: string): string {
  return `${section}.${key}`.toLowerCase();
}

function parseIniDoc(text: string): IniDoc {
  const sectionOrder: string[] = [];
  const keyOrderBySection = new Map<string, string[]>();
  const valuesBySection = new Map<string, Map<string, string>>();

  const ensureSection = (section: string) => {
    if (!valuesBySection.has(section)) {
      valuesBySection.set(section, new Map());
      keyOrderBySection.set(section, []);
      sectionOrder.push(section);
    }
  };

  let currentSection = "";
  ensureSection(currentSection);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).trim();
      ensureSection(currentSection);
      continue;
    }

    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key.length === 0) {
      continue;
    }

    ensureSection(currentSection);
    const sectionValues = valuesBySection.get(currentSection)!;
    const order = keyOrderBySection.get(currentSection)!;
    if (!sectionValues.has(key)) {
      order.push(key);
    }
    sectionValues.set(key, value);
  }

  return {
    sectionOrder,
    keyOrderBySection,
    valuesBySection,
  };
}

function serializeIniDoc(doc: IniDoc): string {
  const lines: string[] = [];

  const sectionNames = new Set(doc.valuesBySection.keys());
  const orderedSections = doc.sectionOrder.filter((section) => sectionNames.has(section));
  for (const section of [...sectionNames].sort()) {
    if (!orderedSections.includes(section)) {
      orderedSections.push(section);
    }
  }

  const renderSection = (section: string) => {
    const values = doc.valuesBySection.get(section);
    if (values === undefined) {
      return;
    }

    const keys = new Set(values.keys());
    const orderedKeys = (doc.keyOrderBySection.get(section) ?? []).filter((key) => keys.has(key));
    for (const key of [...keys].sort()) {
      if (!orderedKeys.includes(key)) {
        orderedKeys.push(key);
      }
    }

    for (const key of orderedKeys) {
      const value = values.get(key) ?? "";
      lines.push(`${key}=${value}`);
    }
  };

  if (orderedSections.includes("")) {
    renderSection("");
  }

  for (const section of orderedSections) {
    if (section === "") {
      continue;
    }
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(`[${section}]`);
    renderSection(section);
  }

  return `${lines.join("\n")}\n`;
}

function setIniValue(text: string, section: string, key: string, value: string): string {
  const doc = parseIniDoc(text);
  if (!doc.valuesBySection.has(section)) {
    doc.valuesBySection.set(section, new Map());
    doc.keyOrderBySection.set(section, []);
    doc.sectionOrder.push(section);
  }

  const values = doc.valuesBySection.get(section)!;
  const order = doc.keyOrderBySection.get(section)!;
  if (!values.has(key)) {
    order.push(key);
  }
  values.set(key, value);
  return serializeIniDoc(doc);
}

function buildTabView(currentDoc: IniDoc, defaultDoc: IniDoc): {
  recognized: SectionGroup[];
  custom: VisualSettingRow[];
} {
  const recognizedBySection = new Map<string, VisualSettingRow[]>();
  const customRows: VisualSettingRow[] = [];

  const defaultSectionSet = new Set(defaultDoc.valuesBySection.keys());
  const orderedSections = defaultDoc.sectionOrder.filter((section) => defaultSectionSet.has(section));
  for (const section of [...defaultSectionSet].sort()) {
    if (!orderedSections.includes(section)) {
      orderedSections.push(section);
    }
  }

  const defaultKeysLookup = new Set<string>();

  for (const section of orderedSections) {
    const defaultValues = defaultDoc.valuesBySection.get(section);
    if (defaultValues === undefined) continue;

    const keys = new Set(defaultValues.keys());
    const orderedKeys = (defaultDoc.keyOrderBySection.get(section) ?? []).filter((key) => keys.has(key));
    for (const key of [...keys].sort()) {
      if (!orderedKeys.includes(key)) {
        orderedKeys.push(key);
      }
    }

    const currentValues = currentDoc.valuesBySection.get(section);
    const rows: VisualSettingRow[] = [];

    for (const key of orderedKeys) {
      defaultKeysLookup.add(sectionKeyLookup(section, key));
      const row: VisualSettingRow = {
        section,
        key,
        value: currentValues?.get(key) ?? defaultValues.get(key) ?? "",
        defaultValue: defaultValues.get(key) ?? "",
        isCustom: false,
      };
      rows.push(row);
    }

    recognizedBySection.set(section, rows);
  }

  const currentSections = new Set(currentDoc.valuesBySection.keys());
  const orderedCurrentSections = currentDoc.sectionOrder.filter((section) => currentSections.has(section));
  for (const section of [...currentSections].sort()) {
    if (!orderedCurrentSections.includes(section)) {
      orderedCurrentSections.push(section);
    }
  }

  for (const section of orderedCurrentSections) {
    const values = currentDoc.valuesBySection.get(section);
    if (values === undefined) continue;
    const keys = new Set(values.keys());
    const orderedKeys = (currentDoc.keyOrderBySection.get(section) ?? []).filter((key) => keys.has(key));
    for (const key of [...keys].sort()) {
      if (!orderedKeys.includes(key)) {
        orderedKeys.push(key);
      }
    }

    for (const key of orderedKeys) {
      if (defaultKeysLookup.has(sectionKeyLookup(section, key))) {
        continue;
      }
      customRows.push({
        section,
        key,
        value: values.get(key) ?? "",
        defaultValue: "",
        isCustom: true,
      });
    }
  }

  const recognized: SectionGroup[] = [...recognizedBySection.entries()].map(([section, rows]) => ({
    section,
    rows,
  }));

  return {
    recognized,
    custom: customRows,
  };
}

function isBooleanLike(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "false";
}

function isIntegerLike(value: string): boolean {
  return /^[-+]?\d+$/.test(value.trim());
}

function isFloatLike(value: string): boolean {
  return /^[-+]?\d+\.\d+$/.test(value.trim());
}

type ValueInputKind = "boolean" | "float" | "integer" | "string";

interface NumericConstraints {
  min: number;
  max: number;
  step: number;
}

const NUMERIC_CONSTRAINTS_BY_SETTING: Record<string, NumericConstraints> = {
  "serversettings.rconport": { min: 1, max: 65535, step: 1 },
  "sessionsettings.port": { min: 1, max: 65535, step: 1 },
  "sessionsettings.queryport": { min: 1, max: 65535, step: 1 },
  "/script/engine.gamesession.maxplayers": { min: 1, max: 255, step: 1 },
  "serversettings.difficultyoffset": { min: 0, max: 1, step: 0.01 },
  "serversettings.overrideofficialdifficulty": { min: 0, max: 10, step: 0.1 },
  "serversettings.structurepickupholdduration": { min: 0, max: 300, step: 0.1 },
  "serversettings.eventcolorschanceoverride": { min: 0, max: 1, step: 0.01 },
  "serversettings.enableafkkickplayercountpercent": { min: 0, max: 1, step: 0.01 },
  "serversettings.autopvestarttimeseconds": { min: 0, max: 86400, step: 1 },
  "serversettings.autopvestoptimeseconds": { min: 0, max: 86400, step: 1 },
  "serversettings.fishinglootqualitymultiplier": { min: 1, max: 5, step: 0.1 },
  "serversettings.supplycratelootqualitymultiplier": { min: 1, max: 5, step: 0.1 },
  "serversettings.updateallowedcheatersinterval": { min: 3, max: 31536000, step: 1 },
  "serversettings.chatlogfilesplitintervalseconds": { min: 45, max: 31536000, step: 1 },
  "serversettings.chatlogflushintervalseconds": { min: 15, max: 31536000, step: 1 },
  "ragnarok.volcanointensity": { min: 0.25, max: 100, step: 0.01 },
};

function detectInputKind(value: string, defaultValue: string): ValueInputKind {
  if (isBooleanLike(value) || isBooleanLike(defaultValue)) {
    return "boolean";
  }
  if (isFloatLike(value) || isFloatLike(defaultValue)) {
    return "float";
  }
  if (isIntegerLike(value) || isIntegerLike(defaultValue)) {
    return "integer";
  }
  return "string";
}

function parseFiniteNumber(raw: string): number | null {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getNumericConstraints(
  section: string,
  key: string,
  kind: Extract<ValueInputKind, "float" | "integer">,
  defaultValue: string,
): NumericConstraints {
  const lookupKey = sectionKeyLookup(section, key);
  const fixed = NUMERIC_CONSTRAINTS_BY_SETTING[lookupKey];
  if (fixed !== undefined) {
    return fixed;
  }

  const lowerKey = key.toLowerCase();
  if (lowerKey.includes("port")) {
    return { min: 1, max: 65535, step: 1 };
  }
  if (lowerKey.includes("chance") || lowerKey.includes("percent")) {
    return { min: 0, max: 1, step: 0.01 };
  }
  if (lowerKey.includes("quality") && lowerKey.includes("multiplier")) {
    return { min: 1, max: 5, step: 0.1 };
  }
  if (
    lowerKey.includes("time") ||
    lowerKey.includes("interval") ||
    lowerKey.includes("duration") ||
    lowerKey.includes("period") ||
    lowerKey.includes("seconds") ||
    lowerKey.includes("minutes") ||
    lowerKey.includes("hours") ||
    lowerKey.includes("cooldown")
  ) {
    return { min: 0, max: 31536000, step: kind === "integer" ? 1 : 0.1 };
  }
  if (lowerKey.includes("multiplier") || lowerKey.includes("scale")) {
    return { min: 0, max: 10, step: 0.01 };
  }

  const parsedDefault = parseFiniteNumber(defaultValue);
  if (kind === "integer") {
    const baseMin = 0;
    const baseMax = 1_000_000;
    return {
      min: parsedDefault === null ? baseMin : Math.min(baseMin, Math.floor(parsedDefault)),
      max: parsedDefault === null ? baseMax : Math.max(baseMax, Math.ceil(parsedDefault)),
      step: 1,
    };
  }

  const floatMin = 0;
  const floatMax = 100;
  return {
    min: parsedDefault === null ? floatMin : Math.min(floatMin, parsedDefault),
    max: parsedDefault === null ? floatMax : Math.max(floatMax, parsedDefault),
    step: 0.01,
  };
}

function normalizeNumericValue(
  value: string,
  kind: Extract<ValueInputKind, "float" | "integer">,
  constraints: NumericConstraints,
): string {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) {
    return value;
  }
  const clamped = clampNumber(parsed, constraints.min, constraints.max);
  if (kind === "integer") {
    return `${Math.round(clamped)}`;
  }
  return `${clamped}`;
}

export function IniEditor(props: Props): JSX.Element {
  const presets = listIniPresets();
  const [snapshot, setSnapshot] = useState<ServerIniSnapshot | null>(null);
  const [payload, setPayload] = useState<ServerIniPayload>(emptyPayload());
  const [activeTab, setActiveTab] = useState<TabKey>("gameUserSettings");
  const [customSectionInput, setCustomSectionInput] = useState<string>("");
  const [customKeyInput, setCustomKeyInput] = useState<string>("");
  const [customValueInput, setCustomValueInput] = useState<string>("");
  const [preview, setPreview] = useState<IniPreview | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(presets[0]?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    void window.api.readServerIni(props.server.id).then((result) => {
      if (canceled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? "No se pudo cargar INI");
        return;
      }
      setSnapshot(result.data);
      setPayload(result.data.payload);
    });
    return () => {
      canceled = true;
    };
  }, [props.server.id]);

  const changed = useMemo(() => {
    if (snapshot === null) return false;
    return (
      payload.gameUserSettings !== snapshot.payload.gameUserSettings ||
      payload.game !== snapshot.payload.game
    );
  }, [payload, snapshot]);

  const docsByTab = useMemo<Record<TabKey, IniDoc>>(
    () => ({
      gameUserSettings: parseIniDoc(payload.gameUserSettings),
      game: parseIniDoc(payload.game),
    }),
    [payload.game, payload.gameUserSettings],
  );

  const tabViews = useMemo(
    () => ({
      gameUserSettings: buildTabView(docsByTab.gameUserSettings, defaultDocsByTab.gameUserSettings),
      game: buildTabView(docsByTab.game, defaultDocsByTab.game),
    }),
    [docsByTab],
  );

  const activeTabView = tabViews[activeTab];

  const setSettingValue = (tab: TabKey, section: string, key: string, value: string) => {
    setPayload((prev) => {
      const currentText = tab === "gameUserSettings" ? prev.gameUserSettings : prev.game;
      const updatedText = setIniValue(currentText, section, key, value);
      const next =
        tab === "gameUserSettings"
          ? { ...prev, gameUserSettings: updatedText }
          : { ...prev, game: updatedText };
      return next;
    });
    setPreview(null);
  };

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    const result = await window.api.previewServerIni(props.server.id, payload);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo generar preview");
      return;
    }
    setPreview(result.data);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const result = await window.api.saveServerIni(props.server.id, payload);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo guardar INI");
      return;
    }

    setPreview(result.data);
    const reloaded = await window.api.readServerIni(props.server.id);
    if (!reloaded.ok) {
      setError(reloaded.error ?? "Guardado parcial: no se pudo recargar");
      return;
    }
    setSnapshot(reloaded.data);
    setPayload(reloaded.data.payload);
  };

  const applyPreset = () => {
    if (selectedPresetId.length === 0) {
      return;
    }
    setPayload((prev) => applyIniPreset(prev, selectedPresetId));
    setPreview(null);
  };

  const addCustomSetting = () => {
    const section = customSectionInput.trim().length > 0
      ? customSectionInput.trim()
      : DEFAULT_SECTION_BY_TAB[activeTab];
    const key = customKeyInput.trim();
    if (key.length === 0) {
      setError("La clave personalizada no puede estar vacía");
      return;
    }

    setError(null);
    setSettingValue(activeTab, section, key, customValueInput.trim());
    setCustomSectionInput("");
    setCustomKeyInput("");
    setCustomValueInput("");
  };

  const openActiveIniInEditor = async () => {
    setError(null);
    const result = await window.api.openServerIniInEditor(props.server.id, activeTab);
    if (!result.ok) {
      setError(result.error ?? "No se pudo abrir el archivo INI");
    }
  };

  const selectedPreset = presets.find((item) => item.id === selectedPresetId) ?? null;

  return (
    <div className="ini-editor">
      <div className="ini-header">
        <h2>Editor INI: {props.server.name}</h2>
        <button onClick={props.onBack}>Volver</button>
      </div>

      {error !== null && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {loading && <p className="muted">Cargando archivos INI...</p>}

      {!loading && snapshot !== null && (
        <>
          <div className="ini-paths panel">
            <h3>Archivos objetivo</h3>
            <p className="muted">GameUserSettings.ini: {snapshot.gameUserSettingsPath}</p>
            <p className="muted">Game.ini: {snapshot.gameIniPath}</p>
            <div className="ini-path-actions">
              <button onClick={() => void openActiveIniInEditor()} disabled={busy}>
                Abrir {TAB_LABELS[activeTab]}.ini en editor del SO
              </button>
            </div>
          </div>

          <div className="ini-presets panel">
            <h3>Plantillas</h3>
            <div className="ini-presets-actions">
              <select
                aria-label="Seleccionar plantilla INI"
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                disabled={busy || presets.length === 0}
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button onClick={applyPreset} disabled={busy || selectedPresetId.length === 0}>
                Aplicar plantilla
              </button>
            </div>
            {selectedPreset !== null && (
              <p className="muted">{selectedPreset.description}</p>
            )}
          </div>

          <div className="ini-tabs" role="tablist" aria-label="Archivos INI">
            <button
              role="tab"
              className={activeTab === "gameUserSettings" ? "active" : ""}
              onClick={() => setActiveTab("gameUserSettings")}
            >
              GameUserSettings
            </button>
            <button
              role="tab"
              className={activeTab === "game" ? "active" : ""}
              onClick={() => setActiveTab("game")}
            >
              Game
            </button>
          </div>

          <section className="panel ini-visual-panel">
            <h3>{TAB_LABELS[activeTab]}.ini</h3>
            <div className="ini-sections">
              {activeTabView.recognized.map((group) => (
                <details key={group.section} className="ini-section" open>
                  <summary>[{group.section}]</summary>
                  <div className="ini-rows">
                    {group.rows.map((row) => {
                      const kind = detectInputKind(row.value, row.defaultValue);
                      const bounds =
                        kind === "float" || kind === "integer"
                          ? getNumericConstraints(row.section, row.key, kind, row.defaultValue)
                          : null;
                      const sliderValueRaw = parseFiniteNumber(row.value) ?? parseFiniteNumber(row.defaultValue) ?? bounds?.min ?? 0;
                      const sliderValue = bounds !== null ? clampNumber(sliderValueRaw, bounds.min, bounds.max) : sliderValueRaw;
                      const urlLike = /^https?:\/\//i.test(row.value) || /^https?:\/\//i.test(row.defaultValue);
                      return (
                        <label key={`${row.section}.${row.key}`} className="ini-row">
                          <span>
                            {row.key}
                            <small className="muted ini-default-note">
                              default: {row.defaultValue.length > 0 ? row.defaultValue : "(vacío)"}
                            </small>
                          </span>
                          {kind === "boolean" && (
                            <select
                              value={row.value.toLowerCase() === "true" ? "true" : "false"}
                              onChange={(e) =>
                                setSettingValue(activeTab, row.section, row.key, e.target.value)
                              }
                              disabled={busy}
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          )}
                          {kind === "float" && (
                            <div className="ini-float-input">
                              <input
                                type="range"
                                min={bounds?.min ?? 0}
                                max={bounds?.max ?? 100}
                                step={bounds?.step ?? 0.01}
                                value={sliderValue}
                                onChange={(e) =>
                                  setSettingValue(
                                    activeTab,
                                    row.section,
                                    row.key,
                                    normalizeNumericValue(e.target.value, "float", bounds ?? { min: 0, max: 100, step: 0.01 }),
                                  )
                                }
                                disabled={busy}
                              />
                              <input
                                type="number"
                                min={bounds?.min}
                                max={bounds?.max}
                                step={bounds?.step ?? 0.01}
                                value={row.value}
                                onChange={(e) =>
                                  setSettingValue(activeTab, row.section, row.key, e.target.value)
                                }
                                onBlur={(e) => {
                                  if (e.target.value.trim().length === 0) {
                                    return;
                                  }
                                  setSettingValue(
                                    activeTab,
                                    row.section,
                                    row.key,
                                    normalizeNumericValue(e.target.value, "float", bounds ?? { min: 0, max: 100, step: 0.01 }),
                                  );
                                }}
                                disabled={busy}
                              />
                            </div>
                          )}
                          {kind === "integer" && (
                            <input
                              type="number"
                              min={bounds?.min}
                              max={bounds?.max}
                              step={1}
                              value={row.value}
                              onChange={(e) =>
                                setSettingValue(activeTab, row.section, row.key, e.target.value)
                              }
                              onBlur={(e) => {
                                if (e.target.value.trim().length === 0) {
                                  return;
                                }
                                setSettingValue(
                                  activeTab,
                                  row.section,
                                  row.key,
                                  normalizeNumericValue(e.target.value, "integer", bounds ?? { min: 0, max: 1_000_000, step: 1 }),
                                );
                              }}
                              disabled={busy}
                            />
                          )}
                          {kind === "string" && (
                            <input
                              type={urlLike ? "url" : "text"}
                              value={row.value}
                              onChange={(e) =>
                                setSettingValue(activeTab, row.section, row.key, e.target.value)
                              }
                              disabled={busy}
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>

            <div className="ini-custom">
              <h4>[CUSTOM]</h4>
              {activeTabView.custom.length === 0 ? (
                <p className="muted">Sin settings no identificados en este archivo.</p>
              ) : (
                <div className="ini-rows">
                  {activeTabView.custom.map((row) => (
                    <label key={`${row.section}.${row.key}`} className="ini-row">
                      <span>
                        [{row.section}] {row.key}
                      </span>
                      <input
                        value={row.value}
                        onChange={(e) => setSettingValue(activeTab, row.section, row.key, e.target.value)}
                        disabled={busy}
                      />
                    </label>
                  ))}
                </div>
              )}

              <div className="ini-custom-add">
                <input
                  value={customSectionInput}
                  onChange={(e) => setCustomSectionInput(e.target.value)}
                  placeholder={`Sección (opcional, por defecto ${DEFAULT_SECTION_BY_TAB[activeTab]})`}
                  disabled={busy}
                />
                <input
                  value={customKeyInput}
                  onChange={(e) => setCustomKeyInput(e.target.value)}
                  placeholder="Clave personalizada"
                  disabled={busy}
                />
                <input
                  value={customValueInput}
                  onChange={(e) => setCustomValueInput(e.target.value)}
                  placeholder="Valor"
                  disabled={busy}
                />
                <button onClick={addCustomSetting} disabled={busy}>
                  Agregar en [CUSTOM]
                </button>
              </div>
            </div>
          </section>

          <div className="ini-actions">
            <button onClick={() => void runPreview()} disabled={busy || !changed}>
              {busy ? "Procesando..." : "Previsualizar diff"}
            </button>
            <button className="primary" onClick={() => void save()} disabled={busy || !changed}>
              {busy ? "Guardando..." : "Guardar INI"}
            </button>
          </div>

          {preview !== null && (
            <section className="panel ini-preview">
              <h3>Preview</h3>
              <p className="muted">Cambios detectados: {preview.changedCount}</p>
              {!preview.valid && (
                <ul className="issues">
                  {preview.issues.map((issue, idx) => (
                    <li key={`${issue.fileKey}-${idx}`} className="error">
                      [{issue.fileKey}] {issue.message}
                    </li>
                  ))}
                </ul>
              )}
              {preview.valid && preview.diff.length === 0 && (
                <p className="muted">Sin cambios respecto al archivo actual.</p>
              )}
              {preview.valid && preview.diff.length > 0 && (
                <div className="ini-diff-list">
                  {preview.diff.slice(0, 300).map((entry, idx) => (
                    <div key={`${entry.fileKey}-${entry.section}-${entry.key}-${idx}`} className="ini-diff-item">
                      <span className={`badge ${entry.change === "added" ? "ok" : entry.change === "removed" ? "bad" : "status-starting"}`}>
                        {entry.change}
                      </span>
                      <strong>
                        [{entry.fileKey}] {entry.section}.{entry.key}
                      </strong>
                      <span className="muted">
                        {entry.before ?? "(vacío)"}{" -> "}{entry.after ?? "(vacío)"}
                      </span>
                    </div>
                  ))}
                  {preview.diff.length > 300 && (
                    <p className="muted">Mostrando 300 de {preview.diff.length} cambios.</p>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
