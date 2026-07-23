import {
  Circle,
  CloudArrowDown,
  HardDrives,
  Stack,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";
import { SimpleGrid } from "@mantine/core";
import { AppMetricCard } from "@ui/AppMetricCard/AppMetricCard";

interface Props {
  totalServers: number;
  runningServers: number;
  okClusters: number;
  totalClusters: number;
  updatesAvailableCount: number;
  warningsCount: number;
}

export function OverviewStats(props: Props): JSX.Element {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 6 }} spacing="sm">
      <AppMetricCard
        icon={<HardDrives size={14} />}
        label="Servidores"
        value={props.totalServers}
        hint={`${props.runningServers} online`}
      />
      <AppMetricCard
        icon={<UsersThree size={14} />}
        label="Jugadores"
        value="—"
        hint="próximamente"
        disabled
      />
      <AppMetricCard
        icon={<Stack size={14} />}
        label="Clusters"
        value={props.totalClusters === 0 ? "—" : `${props.okClusters}/${props.totalClusters}`}
        hint={props.totalClusters === 0 ? "sin clusters" : "transferibles"}
      />
      <AppMetricCard
        icon={<CloudArrowDown size={14} />}
        label="Backups"
        value="—"
        hint="próximamente"
        disabled
      />
      <AppMetricCard
        icon={<Circle size={14} weight="fill" />}
        label="Updates"
        value={props.updatesAvailableCount}
        hint={props.updatesAvailableCount > 0 ? "disponibles" : "al día"}
      />
      <AppMetricCard
        icon={<Warning size={14} />}
        label="Advertencias"
        value={props.warningsCount}
        hint={props.warningsCount > 0 ? "requieren atención" : "sin novedades"}
      />
    </SimpleGrid>
  );
}