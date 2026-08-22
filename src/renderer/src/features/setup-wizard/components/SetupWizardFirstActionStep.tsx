import type { ReactElement } from "react";
import { FolderOpen, Plus, Compass } from "@phosphor-icons/react";
import { Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "../setupWizard.module.css";

interface Props {
  disabled: boolean;
  onCreateServer: () => void;
  onImport: () => void;
  onExplore: () => void;
}

export function SetupWizardFirstActionStep(props: Props): ReactElement {
  return (
    <Stack gap="md">
      <div>
        <Title order={4}>First server</Title>
        <Text size="xs" c="dimmed" mt={2}>
          How do you want to add the first map?
        </Text>
      </div>
      <UnstyledButton
        className={classes.actionCard}
        disabled={props.disabled}
        onClick={props.onCreateServer}
        aria-label="New server"
      >
        <AppSurfaceCard tone="coolEmphasis" padding="sm">
          <Stack gap={4}>
            <Text fw={600} size="sm">
              <Plus size={14} /> New server
            </Text>
            <Text size="xs" c="dimmed">
              Create a server profile and its dedicated folder, then choose Install
              files when you are ready.
            </Text>
          </Stack>
        </AppSurfaceCard>
      </UnstyledButton>
      <UnstyledButton
        className={classes.actionCard}
        disabled={props.disabled}
        onClick={props.onImport}
        aria-label="Import install"
      >
        <AppSurfaceCard tone="cool" padding="sm">
          <Stack gap={4}>
            <Text fw={600} size="sm">
              <FolderOpen size={14} /> Import install
            </Text>
            <Text size="xs" c="dimmed">
              Point YARK at an ASA folder you already have on disk.
            </Text>
          </Stack>
        </AppSurfaceCard>
      </UnstyledButton>
      <UnstyledButton
        className={classes.actionCard}
        disabled={props.disabled}
        onClick={props.onExplore}
        aria-label="I'll explore"
      >
        <AppSurfaceCard tone="flat" padding="sm">
          <Stack gap={4}>
            <Text fw={600} size="sm">
              <Compass size={14} /> I'll explore
            </Text>
            <Text size="xs" c="dimmed">
              Open Overview and add a server later.
            </Text>
          </Stack>
        </AppSurfaceCard>
      </UnstyledButton>
    </Stack>
  );
}
