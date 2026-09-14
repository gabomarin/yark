import type { WorkspaceTab } from "../serverWorkspaceTypes";

export type WorkspaceTabGroupId = "configure" | "operate" | "recover";

export interface WorkspaceTabSpec {
  value: WorkspaceTab;
  label: string;
}

export interface WorkspaceTabGroup {
  id: WorkspaceTabGroupId;
  label: string;
  tabs: WorkspaceTabSpec[];
}

/**
 * Peer tabs stay in one row. Groups are source order only.
 */
export const WORKSPACE_TAB_GROUPS: WorkspaceTabGroup[] = [
  {
    id: "configure",
    label: "Configure",
    tabs: [
      { value: "server", label: "Server" },
      { value: "iniFiles", label: "INI Files" },
      { value: "mods", label: "Mods" },
      { value: "launch", label: "Launch" },
      { value: "backups", label: "Backups" },
    ],
  },
  {
    id: "operate",
    label: "Operate",
    tabs: [
      { value: "logs", label: "Logs" },
      { value: "rcon", label: "RCON" },
    ],
  },
  {
    id: "recover",
    label: "Recover",
    tabs: [
      { value: "maintenance", label: "Maintenance" },
      { value: "asaApi", label: "Ark Server API" },
    ],
  },
];

export function allWorkspaceTabs(): WorkspaceTabSpec[] {
  return WORKSPACE_TAB_GROUPS.flatMap((group) => group.tabs);
}
