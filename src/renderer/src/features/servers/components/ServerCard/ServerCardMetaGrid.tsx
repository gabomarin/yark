import type { ReactElement } from "react";
import { UnstyledButton } from "@mantine/core";
import type { ProcessMetricsUpdatedPush } from "@shared/ipc";
import type { ServerProfile, ServerStatus } from "@shared/types";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import {
  formatServerRamCpuMeta,
} from "@features/servers/model/serverCardProcessMeta";
import {
  formatServerSurvivorMeta,
  resolveServerSurvivorCount,
} from "@features/servers/model/serverCardSurvivorMeta";
import { ServerCardMetaItem } from "./ServerCardMetaItem";
import classes from "./ServerCard.module.css";

interface Props {
  server: ServerProfile;
  status: ServerStatus;
  localVersion: string | null;
  versionMetaTone: "muted" | "ok" | "attention" | "busy" | "default";
  versionRefreshHint: string | null;
  /**
   * Overview passes the ListPlayers cache entry (`null` = no sample yet / empty).
   * Omit (`undefined`) outside Overview so the Survivors column is hidden — do not
   * collapse with `!= null`, or cards without a wired cache would show a false `–`.
   */
  playerList?: PlayerListState | null;
  /**
   * Overview passes process samples (`null` = no sample yet). Omit outside Overview
   * so the RAM / CPU column stays hidden (#302).
   */
  processMetrics?: ProcessMetricsUpdatedPush | null;
  workspaceOpenLabel: string;
  onOpenWorkspace: () => void;
}

export function ServerCardMetaGrid(props: Props): ReactElement {
  // `!== undefined` (not `!= null`): null still shows Survivors as `–`.
  const survivorCount =
    props.playerList !== undefined
      ? resolveServerSurvivorCount({
          status: props.status,
          survivorList: props.playerList,
        })
      : null;
  const survivorsMeta =
    props.playerList !== undefined
      ? formatServerSurvivorMeta({
          status: props.status,
          survivorList: props.playerList,
          maxPlayers: props.server.maxPlayers,
        })
      : null;
  const survivorsMetaTone =
    survivorCount != null && survivorCount > 0 ? "ok" : "default";

  const ramCpuMeta =
    props.processMetrics !== undefined
      ? formatServerRamCpuMeta({
          status: props.status,
          metrics: props.processMetrics,
        })
      : null;

  let metaCols = 4;
  if (survivorsMeta != null) metaCols += 1;
  if (ramCpuMeta != null) metaCols += 1;

  return (
    <UnstyledButton
      className={classes.metaOpen}
      onClick={props.onOpenWorkspace}
      aria-label={props.workspaceOpenLabel}
      tabIndex={-1}
      aria-hidden
    >
      <div
        className={classes.metaGrid}
        data-meta-grid
        data-meta-cols={String(metaCols)}
      >
        <ServerCardMetaItem label="Map" value={props.server.map} />
        <ServerCardMetaItem label="Cluster" value={props.server.clusterId ?? "–"} />
        <ServerCardMetaItem label="Mods" value={String(props.server.mods.length)} />
        {survivorsMeta != null ? (
          <ServerCardMetaItem
            label="Survivors"
            value={survivorsMeta}
            tone={survivorsMetaTone}
          />
        ) : null}
        {ramCpuMeta != null ? (
          <ServerCardMetaItem label="RAM / CPU" value={ramCpuMeta} />
        ) : null}
        <ServerCardMetaItem
          label="Version"
          value={props.localVersion ?? "–"}
          tone={props.versionMetaTone}
          hint={props.versionRefreshHint}
        />
      </div>
    </UnstyledButton>
  );
}
