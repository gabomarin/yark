import type { ReactElement } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Spotlight } from "@mantine/spotlight";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { ServerProfile } from "@shared/types";
import { buildSpotlightActions } from "./appSpotlightModel";

interface Props {
  servers: ServerProfile[];
  onNavigate: (route: Route) => void;
  onOpenServer: (serverId: string) => void;
}

/**
 * Global Ctrl/Cmd+K command palette for route jumps and server workspace open (#104).
 */
export function AppSpotlight(props: Props): ReactElement {
  const actions = buildSpotlightActions(props.servers, {
    onNavigate: props.onNavigate,
    onOpenServer: props.onOpenServer,
  });

  return (
    <Spotlight
      actions={actions}
      shortcut={["mod + K"]}
      nothingFound="No matching pages or servers"
      highlightQuery
      limit={8}
      scrollable
      maxHeight={360}
      searchProps={{
        leftSection: <MagnifyingGlass size={18} />,
        placeholder: "Jump to page or server…",
        "aria-label": "Command palette search",
      }}
    />
  );
}
