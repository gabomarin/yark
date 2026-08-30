export type WorkspaceTab =
  | "server"
  | "mods"
  | "launch"
  | "iniFiles"
  | "backups"
  | "logs"
  | "rcon"
  | "maintenance";

export interface RconHistoryEntry {
  id: string;
  command: string;
  createdAt: string;
  status: "pending" | "success" | "error";
  response: string | null;
  error: string | null;
}
