import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { ClockCounterClockwise, MagnifyingGlass } from "@phosphor-icons/react";
import {
  Spotlight,
  type SpotlightActionData,
  type SpotlightActionGroupData,
} from "@mantine/spotlight";
import type { Route } from "@layout/Sidebar/Sidebar";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import type { ServerProfile } from "@shared/types";
import {
  sortServersForSpotlight,
  SPOTLIGHT_NAV_ITEMS,
} from "./appSpotlightModel";
import {
  getSpotlightRecentSnapshot,
  subscribeSpotlightRecent,
  type SpotlightRecentEntry,
} from "./appSpotlightRecent";
import classes from "./AppSpotlight.module.css";

interface Props {
  servers: ServerProfile[];
  onNavigate: (route: Route) => void;
  onOpenServer: (serverId: string) => void;
}

const SEARCH_PROPS = {
  leftSection: <MagnifyingGlass size={18} />,
  placeholder: "Jump to page or server…",
  "aria-label": "Quick jump search",
} as const;

function serverThumb(server: ServerProfile): ReactElement {
  return (
    <MapArtThumb
      mapId={server.map}
      mapModId={server.mapModId}
      modThumbnailUrl={
        server.mapModId
          ? server.modMetadataCache?.[server.mapModId]?.thumbnailUrl
          : null
      }
      size="sm"
      shape="rounded"
      className={classes.serverThumb}
      decorative
    />
  );
}

function serversFingerprint(servers: ServerProfile[]): string {
  return servers
    .map(
      (server) =>
        `${server.id}\0${server.updatedAt}\0${server.name}\0${server.map}\0${server.mapModId ?? ""}`,
    )
    .join("\n");
}

/**
 * Global Ctrl+K quick jump for routes and server workspace open (#104).
 */
export function AppSpotlight(props: Props): ReactElement {
  const recent = useSyncExternalStore(
    subscribeSpotlightRecent,
    getSpotlightRecentSnapshot,
    () => [],
  );
  const callbacksRef = useRef({
    onNavigate: props.onNavigate,
    onOpenServer: props.onOpenServer,
  });
  useEffect(() => {
    callbacksRef.current = {
      onNavigate: props.onNavigate,
      onOpenServer: props.onOpenServer,
    };
  });

  const serverKey = serversFingerprint(props.servers);
  const recentKey = recent
    .map((entry) =>
      entry.kind === "nav" ? `nav:${entry.route}` : `server:${entry.serverId}`,
    )
    .join("|");

  // Recent is recorded in App after the workspace leave-guard actually applies
  // the navigation / workspace open — not here on click.
  const actions = useMemo(() => {
    const serversById = new Map(
      props.servers.map((server) => [server.id, server]),
    );
    const navById = new Map(SPOTLIGHT_NAV_ITEMS.map((item) => [item.id, item]));

    const recentActions: SpotlightActionData[] = [];
    for (const entry of recent) {
      const action = resolveRecentAction(entry, {
        navById,
        serversById,
        onNavigate: (route) => callbacksRef.current.onNavigate(route),
        onOpenServer: (serverId) => callbacksRef.current.onOpenServer(serverId),
      });
      if (action !== null) {
        recentActions.push(action);
      }
    }

    const navigateGroup: SpotlightActionGroupData = {
      group: "Navigate",
      actions: SPOTLIGHT_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return {
          id: `nav:${item.id}`,
          label: item.label,
          description: item.description,
          keywords: item.keywords,
          leftSection: <Icon size={20} weight="duotone" aria-hidden />,
          onClick: () => callbacksRef.current.onNavigate(item.id),
        } satisfies SpotlightActionData;
      }),
    };

    const serverGroup: SpotlightActionGroupData = {
      group: "Servers",
      actions: sortServersForSpotlight(props.servers).map((server) => ({
        id: `server:${server.id}`,
        label: server.name,
        description: `${server.map} · Open workspace`,
        keywords: [server.map, server.sessionName, server.installDir, server.id],
        leftSection: serverThumb(server),
        onClick: () => callbacksRef.current.onOpenServer(server.id),
      })),
    };

    const next: Array<SpotlightActionGroupData | SpotlightActionData> = [];
    if (recentActions.length > 0) {
      next.push({ group: "Recent", actions: recentActions });
    }
    next.push(navigateGroup, serverGroup);
    return next;
    // Fingerprints keep the memo aligned with content, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional keys
  }, [serverKey, recentKey]);

  return (
    <Spotlight
      actions={actions}
      shortcut={["mod + K"]}
      nothingFound="No matching pages or servers"
      highlightQuery
      limit={12}
      scrollable
      maxHeight={360}
      searchProps={SEARCH_PROPS}
    />
  );
}

function resolveRecentAction(
  entry: SpotlightRecentEntry,
  ctx: {
    navById: Map<Route, (typeof SPOTLIGHT_NAV_ITEMS)[number]>;
    serversById: Map<string, ServerProfile>;
    onNavigate: (route: Route) => void;
    onOpenServer: (serverId: string) => void;
  },
): SpotlightActionData | null {
  if (entry.kind === "nav") {
    const item = ctx.navById.get(entry.route);
    if (item === undefined) {
      return null;
    }
    const Icon = item.icon;
    return {
      id: `recent:nav:${item.id}`,
      label: item.label,
      description: "Recent",
      keywords: [...item.keywords, "recent"],
      leftSection: <Icon size={20} weight="duotone" aria-hidden />,
      rightSection: (
        <ClockCounterClockwise size={14} aria-hidden className={classes.recentMark} />
      ),
      onClick: () => ctx.onNavigate(item.id),
    };
  }

  const server = ctx.serversById.get(entry.serverId);
  if (server === undefined) {
    return null;
  }
  return {
    id: `recent:server:${server.id}`,
    label: server.name,
    description: `${server.map} · Recent`,
    keywords: [server.map, server.sessionName, server.installDir, server.id, "recent"],
    leftSection: serverThumb(server),
    rightSection: (
      <ClockCounterClockwise size={14} aria-hidden className={classes.recentMark} />
    ),
    onClick: () => ctx.onOpenServer(server.id),
  };
}
