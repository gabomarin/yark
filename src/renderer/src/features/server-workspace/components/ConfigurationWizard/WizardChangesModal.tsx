import type { ReactElement } from "react";
import { Alert, Modal, Stack, Text } from "@mantine/core";
import type { wizardChanges } from "../../configurationWizardModel";
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
    <Modal opened={opened} onClose={onClose} title="Draft changes" size="lg" centered>
      <Text c="dimmed" size="sm" mb="md">
        These values have not been applied yet. You can confirm them on the last step.
      </Text>
      {changes.length === 0 && !clusterPathSelected ? (
        <Alert color="blue">The draft matches the current configuration.</Alert>
      ) : clusterPathSelected ? (
        <Alert color="blue" title="Cluster defaults">
          Apply will copy the full “{clusterId}” INI template onto this server (
          {useClusterSeed ? "Seed" : "Restore"}). Ports, passwords, and session name stay on this
          profile.
        </Alert>
      ) : (
        <Stack gap="xs">
          {changes.map((change) => (
            <ChangeRow key={change.field} change={change} />
          ))}
        </Stack>
      )}
    </Modal>
  );
}
