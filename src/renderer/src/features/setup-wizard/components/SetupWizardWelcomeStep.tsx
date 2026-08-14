import type { ReactElement } from "react";
import { HardDrives } from "@phosphor-icons/react";
import { Text } from "@mantine/core";
import { EmptyState } from "@ui/EmptyState/EmptyState";

export function SetupWizardWelcomeStep(): ReactElement {
  return (
    <EmptyState
      layout="stacked"
      titleOrder="h3"
      icon={<HardDrives size={28} />}
      title="Welcome to YARK"
      description="A server manager for ARK: Survival Ascended dedicated servers on this PC."
    >
      <Text size="sm" c="dimmed">
        Skip anytime. You can run this again from Settings.
      </Text>
    </EmptyState>
  );
}
