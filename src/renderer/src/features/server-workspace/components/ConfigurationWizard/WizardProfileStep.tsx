import type { ReactElement } from "react";
import { Alert, Badge, Divider, Group, SimpleGrid, Stack, Switch, Text } from "@mantine/core";
import type { ClusterIniTemplate } from "@shared/types";
import {
  EXPERIENCE_PROFILES,
  type ExperienceProfileId,
} from "../../configuration-wizard/configurationWizardModel";
import { ProfileCard, WizardStep } from "./ConfigurationWizardParts";
import classes from "./ConfigurationWizard.module.css";

interface Props {
  clusterId: string | null;
  clusterTemplateReady: boolean;
  clusterTemplate: ClusterIniTemplate | null;
  clusterPathSelected: boolean;
  useDefaultCopy: boolean;
  profile: ExperienceProfileId;
  singlePlayerSettings: boolean;
  onSelectProfile: (profile: ExperienceProfileId) => void;
  onSinglePlayerSettingsChange: (checked: boolean) => void;
}

export function WizardProfileStep(props: Props): ReactElement {
  const {
    clusterId,
    clusterTemplateReady,
    clusterTemplate,
    clusterPathSelected,
    useDefaultCopy,
    profile,
    singlePlayerSettings,
    onSelectProfile,
    onSinglePlayerSettingsChange,
  } = props;

  return (
    <WizardStep
      title="What kind of server do you want?"
      description="Pick a starting point. You can fine-tune each value before applying."
    >
      {clusterId !== null && clusterTemplateReady && (
        <Stack gap="sm">
          {clusterTemplate !== null ? (
            <ProfileCard
              id="cluster"
              name="Match cluster defaults"
              description={`Pull the shared INI from “${clusterId}”. Ports, session name, and passwords on this server stay put.`}
              chips={["Cluster template", "Skips ahead"]}
              selected={clusterPathSelected}
              onSelect={onSelectProfile}
            />
          ) : (
            <Alert color="blue" title="No cluster INI template yet">
              This server is in “{clusterId}”, but that cluster has no saved INI template. Create
              one on the Clusters page, then reopen this wizard to match fleet defaults in one
              step.
            </Alert>
          )}
          <Divider
            label="Or use a different preset"
            labelPosition="center"
            className={classes.profilePresetDivider}
          />
        </Stack>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <ProfileCard
          id="current"
          name={useDefaultCopy ? "Use default configuration" : "Keep current configuration"}
          description={
            useDefaultCopy
              ? "YARK’s stock rates. You’ll still walk the steps before anything is written."
              : "Leave what’s already on disk and only change what you decide in the next steps."
          }
          chips={useDefaultCopy ? ["Defaults"] : ["No preset"]}
          selected={profile === "current"}
          onSelect={onSelectProfile}
        />
        {EXPERIENCE_PROFILES.map((experienceProfile) => (
          <ProfileCard
            key={experienceProfile.id}
            id={experienceProfile.id}
            name={experienceProfile.name}
            description={experienceProfile.description}
            chips={experienceProfile.chips}
            selected={profile === experienceProfile.id}
            onSelect={onSelectProfile}
          />
        ))}
      </SimpleGrid>

      {clusterPathSelected ? (
        <Alert color="blue" title="Cluster path">
          Continue goes straight to review. Apply copies the full cluster INI template onto this
          server (same as Seed / Restore on Clusters).
        </Alert>
      ) : (
        <Alert color="fossil" className={classes.impactAlert}>
          <Group justify="space-between" align="center" gap="md" wrap="nowrap">
            <Stack gap={6} style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                <Text component="span" fw={700} size="sm">
                  Enable single-player settings
                </Text>
                <Badge size="xs" color="fossil" variant="light" tt="none">
                  High impact
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                Meant for small tribes. When this is on, the rates you pick in Pace and Breeding
                are only the starting point. ARK multiplies them again, and those steps show the
                combined result. You also level and unlock engrams faster, and your tames gain extra
                health and damage.
              </Text>
            </Stack>
            <Switch
              checked={singlePlayerSettings}
              onChange={(event) => onSinglePlayerSettingsChange(event.currentTarget.checked)}
              aria-label="Enable single-player settings"
            />
          </Group>
        </Alert>
      )}
    </WizardStep>
  );
}
