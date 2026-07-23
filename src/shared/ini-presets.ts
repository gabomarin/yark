import parseIni from "ini";
import type { IniFileKey, ServerIniPayload } from "./types";

interface IniPresetUpdate {
  fileKey: IniFileKey;
  section: string;
  key: string;
  value: string;
}

export interface IniPreset {
  id: string;
  name: string;
  description: string;
  updates: IniPresetUpdate[];
}

const PRESETS: IniPreset[] = [
  {
    id: "pve-basico",
    name: "PVE Basico",
    description: "Ajustes comunes para servidores cooperativos PVE.",
    updates: [
      {
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "AllowFlyerCarryPVE",
        value: "True",
      },
      {
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "ShowMapPlayerLocation",
        value: "True",
      },
      {
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "ServerCrosshair",
        value: "True",
      },
    ],
  },
  {
    id: "pvp-basico",
    name: "PVP Basico",
    description: "Base para PVP con mayor exigencia y riesgo.",
    updates: [
      {
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "AllowFlyerCarryPVE",
        value: "False",
      },
      {
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "ServerCrosshair",
        value: "False",
      },
      {
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "AlwaysNotifyPlayerLeft",
        value: "True",
      },
    ],
  },
  {
    id: "rendimiento",
    name: "Rendimiento",
    description: "Valores conservadores para estabilidad en hosts limitados.",
    updates: [
      {
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "MaxPlayers",
        value: "70",
      },
      {
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "NetServerMaxTickRate",
        value: "30",
      },
      {
        fileKey: "gameUserSettings",
        section: "ServerSettings",
        key: "DifficultyOffset",
        value: "0.5",
      },
    ],
  },
];

function textFor(payload: ServerIniPayload, fileKey: IniFileKey): string {
  return fileKey === "gameUserSettings" ? payload.gameUserSettings : payload.game;
}

function updateText(payload: ServerIniPayload, fileKey: IniFileKey, next: string): ServerIniPayload {
  return fileKey === "gameUserSettings"
    ? { ...payload, gameUserSettings: next }
    : { ...payload, game: next };
}

function applyUpdatesToText(text: string, updates: IniPresetUpdate[]): string {
  const parsed = parseIni.parse(text) as Record<string, unknown>;

  for (const update of updates) {
    const sectionRaw = parsed[update.section];
    const section =
      sectionRaw !== null && typeof sectionRaw === "object" && !Array.isArray(sectionRaw)
        ? (sectionRaw as Record<string, unknown>)
        : {};

    section[update.key] = update.value;
    parsed[update.section] = section;
  }

  const result = parseIni.stringify(parsed);
  return result.endsWith("\n") ? result : `${result}\n`;
}

export function listIniPresets(): IniPreset[] {
  return PRESETS;
}

export function applyIniPreset(payload: ServerIniPayload, presetId: string): ServerIniPayload {
  const preset = PRESETS.find((item) => item.id === presetId);
  if (preset === undefined) {
    return payload;
  }

  const byFile: Record<IniFileKey, IniPresetUpdate[]> = {
    gameUserSettings: [],
    game: [],
  };

  for (const update of preset.updates) {
    byFile[update.fileKey].push(update);
  }

  let next = payload;
  for (const fileKey of ["gameUserSettings", "game"] as const) {
    if (byFile[fileKey].length === 0) {
      continue;
    }

    const originalText = textFor(next, fileKey);
    const updatedText = applyUpdatesToText(originalText, byFile[fileKey]);
    next = updateText(next, fileKey, updatedText);
  }

  return next;
}
