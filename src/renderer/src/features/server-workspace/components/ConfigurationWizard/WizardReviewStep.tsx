import type { ReactElement } from "react";
import { Alert, Badge, Group, Stack, Text } from "@mantine/core";
import type { wizardChanges } from "../../configurationWizardModel";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { ChangeRow, WizardStep } from "./ConfigurationWizardParts";

interface Props {
  clusterPathSelected: boolean;
  clusterId: string | null;
  useClusterSeed: boolean;
  serverActive: boolean;
  changes: ReturnType<typeof wizardChanges>;
}

export function WizardReviewStep(props: Props): ReactElement {
  const { clusterPathSelected, clusterId, useClusterSeed, serverActive, changes } = props;

  return (
    <WizardStep
      title={clusterPathSelected ? "Review cluster defaults" : "Review before applying"}
      description={
        clusterPathSelected
          ? "Apply copies the full cluster INI template onto this server. Ports, session name, and passwords stay owned by this profile."
          : "Only the settings listed below will change. Everything else stays as-is."
      }
    >
      {clusterPathSelected ? (
        <Stack gap="md">
          <AppSurfaceCard tone="flat" padding="md" radius="md">
            <Stack gap="sm">
              <Group gap="xs">
                <Badge variant="light" color="blue" tt="none">
                  Cluster template
                </Badge>
                <Text fw={700}>{clusterId}</Text>
              </Group>
              <Text size="sm" c="dimmed">
                Files: GameUserSettings.ini and Game.ini. This uses the same composition as Clusters
                ({useClusterSeed ? "Seed" : "Restore"}): template content with this server’s
                identity keys reapplied.
              </Text>
              <Text size="sm" c="dimmed">
                A local pre-template snapshot is taken before writing.
              </Text>
            </Stack>
          </AppSurfaceCard>
          {serverActive && (
            <Alert color="fossil" title="Server must be stopped">
              Stop the server before applying cluster defaults.
            </Alert>
          )}
        </Stack>
      ) : (
        <>
          {changes.length === 0 ? (
            <Alert color="blue" title="No changes">
              The draft matches the server&apos;s current configuration.
            </Alert>
          ) : (
            <Stack gap="xs">
              {changes.map((change) => (
                <ChangeRow key={change.field} change={change} />
              ))}
            </Stack>
          )}
          {serverActive && (
            <Alert color="fossil" title="Requires a server restart" mt="md">
              You can save now; changes will take effect after the restart.
            </Alert>
          )}
        </>
      )}
    </WizardStep>
  );
}
