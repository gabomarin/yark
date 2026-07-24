import {
  Circle,
  HardDrives,
  Stack,
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
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
      <AppMetricCard
        icon={<HardDrives size={12} />}
        label="Servidores"
        value={props.totalServers}
        hint={`${props.runningServers} en línea`}
      />
      <AppMetricCard
        icon={<Stack size={12} />}
        label="Clusters"
        value={props.totalClusters === 0 ? "—" : `${props.okClusters}/${props.totalClusters}`}
        hint={props.totalClusters === 0 ? "sin clusters" : "transferibles"}
      />
      <AppMetricCard
        icon={<Circle size={12} weight="fill" />}
        label="Actualizaciones"
        value={props.updatesAvailableCount}
        hint={props.updatesAvailableCount > 0 ? "disponibles" : "al día"}
      />
      <AppMetricCard
        icon={<Warning size={12} />}
        label="Advertencias"
        value={props.warningsCount}
        hint={props.warningsCount > 0 ? "requieren atención" : "sin novedades"}
      />
    </SimpleGrid>
  );
}
