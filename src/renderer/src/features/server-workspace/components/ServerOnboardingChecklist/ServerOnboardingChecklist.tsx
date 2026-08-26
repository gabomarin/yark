import type { ReactElement } from "react";
import {
  CheckCircle,
  HardDrives,
  SkipForward,
} from "@phosphor-icons/react";
import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { isInstallationReady } from "@shared/installation-health";
import type { ServerInstallationInfo, ServerProfile } from "@shared/types";
import { useState } from "react";
import classes from "./ServerOnboardingChecklist.module.css";

interface Props {
  server: ServerProfile;
  installation: ServerInstallationInfo | null;
  onDismiss: () => void;
  onOpenAssistant: () => void;
  onInstallFiles: () => void;
}

export function ServerOnboardingChecklist(props: Props): ReactElement {
  const [experienceDone, setExperienceDone] = useState(false);
  const filesInstalled = isInstallationReady(props.installation);

  return (
    <div className={classes.root}>
      <header className={classes.header}>
        <div>
          <Text c="dimmed" size="xs" fw={600}>
            {props.server.name} / First steps
          </Text>
          <Title order={2}>Set up launch</Title>
          <Text c="dimmed" size="sm">
            Ports and cluster are set on Create server. Here: play experience and
            files. You can skip and return to the workspace anytime.
          </Text>
        </div>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<SkipForward size={16} />}
          onClick={props.onDismiss}
        >
          Later
        </Button>
      </header>

      <div className={classes.content}>
        <Stack gap="md">
          <section className={classes.card}>
            <Group gap="sm" mb="xs">
              <Title order={4}>Play experience</Title>
              {experienceDone && (
                <CheckCircle size={18} color="var(--mantine-color-green-6)" />
              )}
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              Tune rates and comfort with the wizard, or leave the INI defaults.
            </Text>
            <Group gap="xs">
              <Button
                size="sm"
                variant={filesInstalled ? "filled" : "light"}
                data-cta-prominence={filesInstalled ? "primary" : "secondary"}
                onClick={() => {
                  setExperienceDone(true);
                  props.onOpenAssistant();
                }}
              >
                Configure with wizard
              </Button>
              <Button
                size="sm"
                variant="default"
                data-cta-prominence="secondary"
                onClick={() => setExperienceDone(true)}
              >
                Use defaults
              </Button>
            </Group>
          </section>

          <section className={classes.card}>
            <Group gap="sm" mb="xs">
              <HardDrives size={18} />
              <Title order={4}>Server files</Title>
              {filesInstalled && (
                <CheckCircle size={18} color="var(--mantine-color-green-6)" />
              )}
            </Group>
            <Text c="dimmed" size="sm" mb="sm">
              {filesInstalled
                ? "ASA files are already on disk for this profile. You can verify or update from the side panel when needed."
                : "Download the dedicated server binaries with SteamCMD. You need this before Start; it does not block the rest of the workspace."}
            </Text>
            <Group gap="xs">
              {!filesInstalled && (
                <Button
                  size="sm"
                  variant="filled"
                  data-cta-prominence="primary"
                  onClick={props.onInstallFiles}
                >
                  Install files
                </Button>
              )}
              <Button size="sm" variant="subtle" onClick={props.onDismiss}>
                Done, go to workspace
              </Button>
            </Group>
          </section>
        </Stack>
      </div>
    </div>
  );
}
