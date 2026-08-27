import { SimpleGrid } from "@mantine/core";
import type { ReactElement } from "react";
import { AppMetricCard } from "@ui/AppMetricCard/AppMetricCard";
import type { ServerBackupMetricStrip } from "../../model/serverBackupPanelModel";
import classes from "../../BackupsPage.module.css";

interface Props {
  metrics: ServerBackupMetricStrip;
}

export function ServerBackupMetrics(props: Props): ReactElement {
  const { metrics } = props;
  return (
    <SimpleGrid
      cols={{ base: 1, xs: 3 }}
      spacing={4}
      className={classes.embeddedMetrics}
      data-server-backup-metrics
    >
      <AppMetricCard
        label="Last backup"
        value={metrics.lastBackupValue}
        hint={metrics.lastBackupHint}
      />
      <AppMetricCard
        label="Keep last"
        value={metrics.retainValue}
        hint={metrics.retainHint}
      />
      <AppMetricCard
        label="Destination"
        value={metrics.destinationValue}
        hint={metrics.destinationHint}
      />
    </SimpleGrid>
  );
}
