import type { IniFileKey, ServerIniPayload } from "./types";
import { setIniTextValue } from "./ini-text";

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
    id: "pve-basic",
    name: "Basic PVE",
    description: "Common settings for cooperative PVE servers.",
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
    id: "pvp-basic",
    name: "Basic PVP",
    description: "Baseline for higher-stakes PVP servers.",
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
    id: "performance",
    name: "Performance",
    description: "Conservative values for stability on limited hosts.",
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
  let next = text;
  for (const update of updates) {
    next = setIniTextValue(next, update.section, update.key, update.value);
  }
  return next;
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
