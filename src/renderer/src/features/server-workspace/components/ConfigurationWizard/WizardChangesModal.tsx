import type { ReactElement } from "react";
import { Stack, Text } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import type { wizardChanges } from "../../configuration-wizard/configurationWizardModel";
import { ChangeRow } from "./ConfigurationWizardParts";

interface Props {
  opened: boolean;
  onClose: () => void;
  changes: ReturnType<typeof wizardChanges>;
  clusterPathSelected: boolean;
  clusterId: string | null;
  useClusterSeed: boolean;
}

export function WizardChangesModal(props: Props): ReactElement {
  const { opened, onClose, changes, clusterPathSelected, clusterId, useClusterSeed } = props;

  return (
    <AppPanelModal opened={opened} onClose={onClose} title="Draft changes" size="lg">
      <Text c="dimmed" size="sm" mb="md">
        These values have not been applied yet. You can confirm them on the last step.
      </Text>
      {changes.length === 0 && !clusterPathSelected ? (
        <AppAlert color="blue">The draft matches the current configuration.</AppAlert>
      ) : clusterPathSelected ? (
        <AppAlert color="blue" title="Cluster defaults">
          Apply will copy the full “{clusterId}” INI template onto this server (
          {useClusterSeed ? "Seed" : "Restore"}). Ports, passwords, and session name stay on this
          profile.
        </AppAlert>
      ) : (
        <Stack gap="xs">
          {changes.map((change) => (
            <ChangeRow key={change.field} change={change} />
          ))}
        </Stack>
      )}
    </AppPanelModal>
  );
}
