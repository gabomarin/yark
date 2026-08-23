import type { ReactElement, ReactNode } from "react";
import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { ServerFormAlerts } from "./ServerFormAlerts";
import classes from "./ServerForm.module.css";

interface Props {
  inputSize: "xs" | "sm";
  isDirty: boolean;
  saving: boolean;
  filesJobActive: boolean;
  moveJobActive: boolean;
  serverActive: boolean;
  errorAlert: ReactNode;
  profileFields: ReactNode;
  moveDialog: ReactNode;
  onOpenConfigurationAssistant?: () => void;
  configurationAssistantDisabled?: boolean;
  onRevert: () => void;
  onSubmit: () => void;
}

/** Workspace-tab chrome: header, scroll body, cancel/save footer. */
export function ServerFormEmbedded(props: Props): ReactElement {
  return (
    <AppSurfaceCard
      tone="flat"
      fill
      padding={0}
      radius="md"
      className={classes.embedded}
      data-server-form="embedded"
    >
      <header className={classes.embeddedHeader}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <div>
            <Title order={4}>Server information</Title>
            <Text c="dimmed" fz="xs">
              Name, ports, access, and cluster. Launch flags live on the Launch tab.
            </Text>
          </div>
          {props.onOpenConfigurationAssistant !== undefined && (
            <Button
              size={props.inputSize}
              variant="light"
              onClick={props.onOpenConfigurationAssistant}
              disabled={props.configurationAssistantDisabled}
              title={
                props.configurationAssistantDisabled
                  ? "Save or discard pending INI Files changes"
                  : "Configure the most common settings with a wizard"
              }
            >
              Configuration wizard
            </Button>
          )}
        </Group>
      </header>
      <div className={classes.embeddedScroll} data-server-form-scroll>
        <Stack gap="md">
          <ServerFormAlerts
            filesJobActive={props.filesJobActive}
            moveJobActive={props.moveJobActive}
            serverActive={props.serverActive}
          />
          {props.errorAlert}
          {props.profileFields}
        </Stack>
      </div>
      <footer className={classes.embeddedFooter}>
        <Group justify="flex-end">
          {props.isDirty && (
            <Button
              size={props.inputSize}
              variant="default"
              onClick={props.onRevert}
              disabled={props.saving}
            >
              Cancel
            </Button>
          )}
          <Button
            size={props.inputSize}
            onClick={props.onSubmit}
            loading={props.saving}
          >
            Save changes
          </Button>
        </Group>
      </footer>
      {props.moveDialog}
    </AppSurfaceCard>
  );
}
