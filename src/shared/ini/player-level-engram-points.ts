import { parseIniTextRows } from "./ini-text";

/** Repeated Game.ini key: one integer per player level, in order. */
export const PLAYER_LEVEL_ENGRAM_POINTS_KEY = "OverridePlayerLevelEngramPoints";

const KEY = "overrideplayerlevelengrampoints";
const SHOOTER_GAME_MODE = "shootergame.shootergamemode";

export interface PlayerLevelEngramPointsRow {
  section: string;
  /** 0-based index of this key inside its section. */
  occurrence: number;
  /** 1-based level. File order is the level. */
  level: number;
  points: string;
}

export function isPlayerLevelEngramPointsKey(key: string): boolean {
  return key.trim().toLowerCase() === KEY;
}

export function isPlayerLevelEngramPointsValue(value: string): boolean {
  return /^(?:0|[1-9]\d{0,6})$/.test(value.trim());
}

export function listPlayerLevelEngramPoints(text: string): PlayerLevelEngramPointsRow[] {
  const seen = new Map<string, number>();
  const rows: PlayerLevelEngramPointsRow[] = [];
  for (const row of parseIniTextRows(text)) {
    if (!isPlayerLevelEngramPointsKey(row.key)) continue;
    const id = `${row.section.toLowerCase()}\u001f${KEY}`;
    const occurrence = seen.get(id) ?? 0;
    seen.set(id, occurrence + 1);
    rows.push({ section: row.section, occurrence, level: rows.length + 1, points: row.value });
  }
  return rows;
}

/** Section for a new last level: the list's section, else the game mode section, else the ASA header. */
export function sectionForNewPlayerLevelEngramPoints(text: string): string {
  const listed = listPlayerLevelEngramPoints(text);
  const last = listed[listed.length - 1];
  if (last !== undefined) return last.section;
  let found: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\[(.+)\]$/.exec(raw.trim());
    const name = match?.[1]?.trim();
    if (name !== undefined && isShooterGameMode(name)) found = name;
  }
  return found ?? "/Script/ShooterGame.ShooterGameMode";
}

function isShooterGameMode(section: string): boolean {
  const name = section.trim().toLowerCase();
  return name === SHOOTER_GAME_MODE || name === `/script/${SHOOTER_GAME_MODE}`;
}
