import type { ReactElement } from "react";
import { Check } from "@phosphor-icons/react";
import {
  Alert,
  Button,
  Group,
  Progress,
  Skeleton,
  Stack,
  Stepper,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ServerProfile } from "@shared/types";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { WizardShell } from "./ConfigurationWizardParts";
import { WizardBreedingStep } from "./WizardBreedingStep";
import { WizardChangesModal } from "./WizardChangesModal";
import { WizardFooter } from "./WizardFooter";
import { WizardPaceStep } from "./WizardPaceStep";
import { WizardProfileStep } from "./WizardProfileStep";
import { WizardQolStep } from "./WizardQolStep";
import { WizardReviewStep } from "./WizardReviewStep";
import { WizardWorldStep } from "./WizardWorldStep";
import { STEP_COUNT, STEP_LABELS } from "./wizardSteps";
import { useConfigurationWizard } from "../../hooks/useConfigurationWizard";
import classes from "./ConfigurationWizard.module.css";

interface Props {
  server: ServerProfile;
  serverActive: boolean;
  /** First-run create workspace — prefer “Use default configuration” copy. */
  onboarding?: boolean;
  onCancel: () => void;
  onApplied: () => void;
  onDraftChange?: (dirty: boolean) => void;
}

export function ConfigurationWizard(props: Props): ReactElement {
  const compactProgress = useMediaQuery("(max-width: 1100px)", false);
  const wizard = useConfigurationWizard(props);
  const {
    form,
    activeStep,
    loading,
    saving,
    saved,
    error,
    setError,
    changesOpen,
    setChangesOpen,
    progressionPreset,
    breedingPreset,
    worldPreset,
    difficultyChoice,
    clusterId,
    clusterTemplate,
    clusterTemplateReady,
    clusterPathSelected,
    useDefaultCopy,
    useClusterSeed,
    changes,
    draftDirty,
    chooseProfile,
    chooseProgressionPreset,
    chooseBreedingPreset,
    chooseWorldPreset,
    chooseDifficulty,
    chooseCustomDifficultyLevel,
    cancel,
    next,
    previous,
    apply,
  } = wizard;

  if (loading) {
    return (
      <WizardShell>
        <Skeleton height={28} width="32%" />
        <Skeleton height={18} width="56%" mt="xs" />
        <Skeleton height={64} mt="xl" />
        <Skeleton height={280} mt="lg" />
      </WizardShell>
    );
  }

  if (saved) {
    return (
      <WizardShell>
        <div className={classes.success}>
          <EmptyState
            layout="stacked"
            titleOrder="h3"
            icon={<Check size={28} weight="bold" />}
            title="Configuration applied"
            description="Only the settings in this wizard were changed. Everything else was left as-is."
            action={<Button onClick={props.onCancel}>Back to server</Button>}
          >
            {props.serverActive && (
              <Alert color="fossil" title="Restart pending" maw={520}>
                The new values will take effect when you restart the server.
              </Alert>
            )}
          </EmptyState>
        </div>
      </WizardShell>
    );
  }

  return (
    <WizardShell>
      <WizardChangesModal
        opened={changesOpen}
        onClose={() => setChangesOpen(false)}
        changes={changes}
        clusterPathSelected={clusterPathSelected}
        clusterId={clusterId}
        useClusterSeed={useClusterSeed}
      />

      <header className={classes.header}>
        <Stack gap={4}>
          <Text className={classes.metaLabel} c="dimmed" size="xs" fw={700}>
            {props.server.name} / Configuration wizard
          </Text>
          <Title order={2}>Set up the play experience</Title>
          <Text c="dimmed" size="sm">
            We start from your current values. Nothing is written until the final review.
          </Text>
        </Stack>
      </header>

      <div className={classes.progress}>
        {compactProgress ? (
          <Stack gap="xxs">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Step {activeStep + 1} of {STEP_COUNT}
              </Text>
              <Text size="sm" c="dimmed">
                {STEP_LABELS[activeStep]}
              </Text>
            </Group>
            <Progress value={((activeStep + 1) / STEP_COUNT) * 100} size="sm" />
          </Stack>
        ) : (
          <Stack gap="xs">
            <Text className={classes.metaLabel} c="dimmed" size="xs" fw={700}>
              Step {activeStep + 1} of {STEP_COUNT} · {STEP_LABELS[activeStep]}
            </Text>
            <Stepper active={activeStep} allowNextStepsSelect={false} size="sm">
              {STEP_LABELS.map((label) => (
                <Stepper.Step key={label} label={label} />
              ))}
            </Stepper>
          </Stack>
        )}
      </div>

      <main className={classes.content}>
        {error !== null && (
          <Alert color="red" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {activeStep === 0 && (
          <WizardProfileStep
            clusterId={clusterId}
            clusterTemplateReady={clusterTemplateReady}
            clusterTemplate={clusterTemplate}
            clusterPathSelected={clusterPathSelected}
            useDefaultCopy={useDefaultCopy}
            profile={form.values.profile}
            singlePlayerSettings={form.values.singlePlayerSettings}
            onSelectProfile={chooseProfile}
            onSinglePlayerSettingsChange={(checked) =>
              form.setFieldValue("singlePlayerSettings", checked)
            }
          />
        )}

        {activeStep === 1 && (
          <WizardPaceStep
            draft={form.values}
            progressionPreset={progressionPreset}
            difficultyChoice={difficultyChoice}
            onProgressionPresetChange={chooseProgressionPreset}
            onDifficultyChoiceChange={chooseDifficulty}
            onCustomLevelChange={chooseCustomDifficultyLevel}
          />
        )}

        {activeStep === 2 && (
          <WizardBreedingStep
            draft={form.values}
            breedingPreset={breedingPreset}
            onBreedingPresetChange={chooseBreedingPreset}
          />
        )}

        {activeStep === 3 && (
          <WizardWorldStep
            draft={form.values}
            worldPreset={worldPreset}
            onWorldPresetChange={chooseWorldPreset}
          />
        )}

        {activeStep === 4 && <WizardQolStep form={form} />}

        {activeStep === 5 && (
          <WizardReviewStep
            clusterPathSelected={clusterPathSelected}
            clusterId={clusterId}
            useClusterSeed={useClusterSeed}
            serverActive={props.serverActive}
            changes={changes}
          />
        )}
      </main>

      <WizardFooter
        activeStep={activeStep}
        saving={saving}
        draftDirty={draftDirty}
        changes={changes}
        clusterPathSelected={clusterPathSelected}
        clusterTemplate={clusterTemplate}
        serverActive={props.serverActive}
        onCancel={cancel}
        onPrevious={previous}
        onNext={next}
        onApply={() => void apply()}
        onViewChanges={() => setChangesOpen(true)}
      />
    </WizardShell>
  );
}
