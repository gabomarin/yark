import type { ReactElement } from "react";
import { SimpleGrid, TextInput } from "@mantine/core";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import type { ModMetadata, ServerProfile } from "@shared/types";
import type { MapFieldChange } from "./ServerFormMapField";
import { ServerFormClusterFields } from "./ServerFormClusterFields";
import { ServerFormIdentityHero } from "./ServerFormIdentityHero";
import { ServerFormInstallPath } from "./ServerFormInstallPath";
import { ServerFormMapField } from "./ServerFormMapField";
import { ServerFormReachabilityFields } from "./ServerFormReachabilityFields";
import { ServerFormSection } from "./ServerFormSection";
import { ServerFormStartupFields } from "./ServerFormStartupFields";

export interface ServerFormProfileFieldsProps {
  isCreate: boolean;
  embedded?: boolean;
  inputSize: "xs" | "sm";
  name: string;
  sessionName: string;
  map: string;
  mapModId: string | null;
  mapSaveFolder: string | null;
  installDir: string;
  gamePort: string;
  queryPort: string;
  rconPort: string;
  maxPlayers: string;
  serverPassword: string;
  adminPassword: string;
  clusterId: string;
  clusterDir: string;
  nameFolderError: string | null;
  resolvedInstallPreview: string;
  servers: ServerProfile[];
  knownClusters: KnownClusterOption[];
  mapMods: ModMetadata[];
  mapFieldKey: string;
  browsingInstallDir: boolean;
  browsingClusterDir: boolean;
  excludeServerId?: string;
  showStartup?: boolean;
  autoStart?: boolean;
  showInactiveWarning?: boolean;
  moveDisabled: boolean;
  moveDisabledReason: string;
  onNameChange: (value: string) => void;
  onSessionNameChange: (value: string) => void;
  onMapChange: (next: MapFieldChange) => void;
  onMapsSearchApply: (payload: import("./mapsSearchModel").MapsSearchApplyPayload) => void;
  onInstallDirChange: (value: string) => void;
  onBrowseInstallDir: () => void;
  onCreatePathIssueChange: (message: string | null) => void;
  onOpenMove: () => void;
  onGamePortChange: (value: string) => void;
  onQueryPortChange: (value: string) => void;
  onRconPortChange: (value: string) => void;
  onMaxPlayersChange: (value: string) => void;
  onServerPasswordChange: (value: string) => void;
  onAdminPasswordChange: (value: string) => void;
  onSelectCreateCluster: (clusterId: string | null) => void;
  onOpenClusters?: () => void;
  onBrowseClusterDir: () => void;
  onClusterIdChange: (value: string) => void;
  onClusterDirChange: (value: string) => void;
  onAutoStartChange?: (value: boolean) => void;
}

/** Identity | Reachability | Cluster | Startup grid (#292). */
export function ServerFormProfileFields(
  props: ServerFormProfileFieldsProps,
): ReactElement {
  const embedded = props.embedded === true;
  const cardPadding = embedded ? "sm" : "md";
  const gridGap = embedded ? "md" : "lg";
  const mapMod =
    props.mapModId === null
      ? null
      : props.mapMods.find((mod) => mod.id === props.mapModId) ?? null;

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing={gridGap}>
      <ServerFormSection tone="coolEmphasis" padding={cardPadding}>
        <ServerFormIdentityHero
          name={props.name}
          mapToken={props.map}
          mapModId={props.mapModId}
          modThumbnailUrl={mapMod?.thumbnailUrl}
          gamePort={props.gamePort}
          queryPort={props.queryPort}
          rconPort={props.rconPort}
          compact={embedded}
        />
        <TextInput
          label="Name"
          size={props.inputSize}
          value={props.name}
          onChange={(e) => props.onNameChange(e.currentTarget.value)}
          required
          error={props.nameFolderError ?? undefined}
          description={
            props.isCreate
              ? 'YARK profile and install subfolder. Do not use < > : " / \\ | ? *'
              : "YARK profile name"
          }
        />
        <TextInput
          label="Session name"
          size={props.inputSize}
          value={props.sessionName}
          onChange={(e) => props.onSessionNameChange(e.currentTarget.value)}
          required
          description="Name survivors see in the server browser"
        />
        <ServerFormMapField
          key={props.mapFieldKey}
          map={props.map}
          mapModId={props.mapModId}
          mapSaveFolder={props.mapSaveFolder}
          mapMods={props.mapMods}
          inputSize={props.inputSize}
          isCreate={props.isCreate}
          onChange={props.onMapChange}
          onMapsSearchApply={props.onMapsSearchApply}
        />
        <ServerFormInstallPath
          isCreate={props.isCreate}
          installDir={props.installDir}
          resolvedInstallPreview={props.resolvedInstallPreview}
          fleetInstalls={props.servers.map((server) => ({
            id: server.id,
            name: server.name,
            installDir: server.installDir,
          }))}
          onCreatePathIssueChange={props.onCreatePathIssueChange}
          inputSize={props.inputSize}
          browsingInstallDir={props.browsingInstallDir}
          moveDisabled={props.moveDisabled}
          moveDisabledReason={props.moveDisabledReason}
          onInstallDirChange={props.onInstallDirChange}
          onBrowseInstallDir={props.onBrowseInstallDir}
          onOpenMove={props.onOpenMove}
        />
      </ServerFormSection>

      <ServerFormSection
        eyebrow="Network & access"
        title="Reachability"
        tone="cool"
        fill={!embedded}
        padding={cardPadding}
      >
        <ServerFormReachabilityFields
          inputSize={props.inputSize}
          servers={props.servers}
          excludeServerId={props.excludeServerId}
          name={props.name}
          gamePort={props.gamePort}
          queryPort={props.queryPort}
          rconPort={props.rconPort}
          maxPlayers={props.maxPlayers}
          serverPassword={props.serverPassword}
          adminPassword={props.adminPassword}
          onGamePortChange={props.onGamePortChange}
          onQueryPortChange={props.onQueryPortChange}
          onRconPortChange={props.onRconPortChange}
          onMaxPlayersChange={props.onMaxPlayersChange}
          onServerPasswordChange={props.onServerPasswordChange}
          onAdminPasswordChange={props.onAdminPasswordChange}
        />
      </ServerFormSection>

      <ServerFormSection
        title="Cluster"
        tone="flat"
        span2
        padding={cardPadding}
      >
        <ServerFormClusterFields
          isCreate={props.isCreate}
          knownClusters={props.knownClusters}
          clusterId={props.clusterId}
          clusterDir={props.clusterDir}
          inputSize={props.inputSize}
          browsingClusterDir={props.browsingClusterDir}
          onSelectCreateCluster={props.onSelectCreateCluster}
          onOpenClusters={props.onOpenClusters}
          onClusterIdChange={props.onClusterIdChange}
          onClusterDirChange={props.onClusterDirChange}
          onBrowseClusterDir={props.onBrowseClusterDir}
        />
      </ServerFormSection>

      {props.showStartup === true && (
        <ServerFormSection
          title="Startup"
          tone="flat"
          span2
          padding={cardPadding}
        >
          <ServerFormStartupFields
            autoStart={props.autoStart === true}
            showInactiveWarning={props.showInactiveWarning === true}
            onAutoStartChange={(autoStart) =>
              props.onAutoStartChange?.(autoStart)
            }
          />
        </ServerFormSection>
      )}
    </SimpleGrid>
  );
}
