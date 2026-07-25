/**
 * Parses ASA / ARK `ListPlayers` RCON responses into player keys + names.
 *
 * Observed shapes vary by build; common lines look like:
 * - `0. PlayerName, 76561198000000000`
 * - `0. PlayerName, UniqueNetId:0002abcdef…`
 * - `0. PlayerName, EOS:0002abcdef…`
 * - `No Players Connected`
 */
export interface ListedPlayer {
  /** Stable id used to match `.arkprofile` filenames when possible. */
  key: string;
  name: string | null;
}

export function parseListPlayersResponse(raw: string): ListedPlayer[] {
  const text = raw.replace(/\r/g, "").trim();
  if (text.length === 0) return [];
  if (/no players/i.test(text)) return [];

  const players: ListedPlayer[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (/^no players/i.test(trimmed)) continue;

    const indexed = trimmed.match(
      /^\d+\.\s*(.+?)\s*,\s*(?:UniqueNetId:|EOS:)?([A-Za-z0-9_-]+)\s*$/i,
    );
    if (indexed !== null) {
      const name = indexed[1]?.trim() ?? "";
      const key = (indexed[2] ?? "").trim();
      if (key.length === 0) continue;
      const normalized = key.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      players.push({
        key: normalized,
        name: name.length > 0 ? name : null,
      });
      continue;
    }

    const eosOnly = trimmed.match(
      /(?:UniqueNetId:|EOS:)([A-Za-z0-9_-]+)/i,
    );
    const steamOnly = trimmed.match(/\b(7656\d{13})\b/);
    const key = (eosOnly?.[1] ?? steamOnly?.[1] ?? "").trim().toLowerCase();
    if (key.length === 0) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const nameMatch = trimmed.match(/^\d+\.\s*([^,]+)/);
    const name = nameMatch?.[1]?.trim() ?? null;
    players.push({ key, name: name !== null && name.length > 0 ? name : null });
  }

  return players;
}
