import type { BackupRecord } from "./types";

const PLAYER_KEY_NOTE_RE = /\[playerKey=([^\]]+)\]/i;
const PLAYER_NAME_NOTE_RE = /\[playerName=([^\]]+)\]/i;

/** Retention pool key for full (all-profiles) player snapshots. */
export const FULL_PLAYERS_RETENTION_KEY = "__all__";

export function parsePlayerKeyFromNotes(notes: string | null | undefined): string | null {
  const match = notes?.match(PLAYER_KEY_NOTE_RE);
  const key = match?.[1]?.trim();
  return key !== undefined && key.length > 0 ? key : null;
}

export function parsePlayerNameFromNotes(notes: string | null | undefined): string | null {
  const tagged = notes?.match(PLAYER_NAME_NOTE_RE);
  const taggedName = tagged?.[1]?.trim();
  if (taggedName !== undefined && taggedName.length > 0) {
    return taggedName;
  }

  // Legacy notes: `[playerKey=…] Player connected: Name (key)`
  const legacy = notes?.match(
    /Player (?:connected|disconnected):\s*(.+?)\s*\(/i,
  );
  const legacyName = legacy?.[1]?.trim();
  if (legacyName !== undefined && legacyName.length > 0) {
    return legacyName;
  }
  return null;
}

export function formatPlayerSessionNotes(
  event: "connect" | "disconnect",
  playerKey: string,
  playerName: string | null,
): string {
  const label = event === "connect" ? "Player connected" : "Player disconnected";
  const trimmedName =
    playerName !== null && playerName.trim().length > 0 ? playerName.trim() : null;
  const nameTag = trimmedName !== null ? `[playerName=${trimmedName}] ` : "";
  const namePart = trimmedName !== null ? `${trimmedName} ` : "";
  return `[playerKey=${playerKey}] ${nameTag}${label}: ${namePart}(${playerKey})`;
}

/** Retention pool key for players backups (per-player when annotated). */
export function playersRetentionKey(backup: BackupRecord): string {
  const key = parsePlayerKeyFromNotes(backup.notes);
  if (key !== null) {
    return key.trim().toLowerCase().replace(/^eos:/i, "");
  }
  return FULL_PLAYERS_RETENTION_KEY;
}

function pathStem(backupPath: string): string {
  const normalized = backupPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? backupPath;
}

/**
 * Display label for a players backup: player name when known, else key,
 * else path stem / id.
 */
export function playerBackupDisplayName(backup: BackupRecord): string {
  const name = parsePlayerNameFromNotes(backup.notes);
  if (name !== null) return name;
  const key = parsePlayerKeyFromNotes(backup.notes);
  if (key !== null) return key;
  if (backup.type === "manual" || backup.type === "scheduled") {
    return "All players";
  }
  const stem = pathStem(backup.path);
  return stem.length > 0 ? stem : backup.id;
}
