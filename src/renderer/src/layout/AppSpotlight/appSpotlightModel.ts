import type {
  SpotlightActionData,
  SpotlightActionGroupData,
} from "@mantine/spotlight";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { ServerProfile } from "@shared/types";

export interface SpotlightNavHandlers {
  onNavigate: (route: Route) => void;
  onOpenServer: (serverId: string) => void;
}

const NAV_ACTIONS: Array<{
  id: Route;
  label: string;
  description: string;
  keywords: string[];
}> = [
  {
    id: "overview",
    label: "Servers",
    description: "Overview and server list",
    keywords: ["home", "overview", "fleet"],
  },
  {
    id: "clusters",
    label: "Clusters",
    description: "Cluster membership and transfer",
    keywords: ["cluster", "transfer"],
  },
  {
    id: "backups",
    label: "Backups",
    description: "Fleet backup health and cleanup",
    keywords: ["backup", "archive", "restore"],
  },
  {
    id: "logs",
    label: "Logs",
    description: "Fleet activity and problems",
    keywords: ["log", "events", "activity"],
  },
  {
    id: "settings",
    label: "Settings",
    description: "App preferences and SteamCMD",
    keywords: ["preferences", "options", "steamcmd"],
  },
];

/** Pure action list for Spotlight (groups: Navigate + Servers). */
export function buildSpotlightActions(
  servers: ServerProfile[],
  handlers: SpotlightNavHandlers,
): Array<SpotlightActionGroupData | SpotlightActionData> {
  const navigateGroup: SpotlightActionGroupData = {
    group: "Navigate",
    actions: NAV_ACTIONS.map((item) => ({
      id: `nav:${item.id}`,
      label: item.label,
      description: item.description,
      keywords: item.keywords,
      onClick: () => handlers.onNavigate(item.id),
    })),
  };

  const sorted = [...servers].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  const serverGroup: SpotlightActionGroupData = {
    group: "Servers",
    actions: sorted.map((server) => ({
      id: `server:${server.id}`,
      label: server.name,
      description: `${server.map} · Open workspace`,
      keywords: [server.map, server.sessionName, server.installDir, server.id],
      onClick: () => handlers.onOpenServer(server.id),
    })),
  };

  return [navigateGroup, serverGroup];
}
