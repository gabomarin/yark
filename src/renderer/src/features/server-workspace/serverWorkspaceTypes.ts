export type WorkspaceTab =
  | "server"
  | "mods"
  | "iniFiles"
  | "backups"
  | "logs"
  | "rcon";

export interface RconHistoryEntry {
  id: string;
  command: string;
  createdAt: string;
  status: "pending" | "success" | "error";
  response: string | null;
  error: string | null;
}
