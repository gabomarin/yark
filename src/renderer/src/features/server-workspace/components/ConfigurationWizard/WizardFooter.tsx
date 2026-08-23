import type { ReactElement } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CirclesThreePlus,
  Eye,
  FloppyDisk,
  X,
} from "@phosphor-icons/react";
import { Button, Group } from "@mantine/core";
import type { ClusterIniTemplate } from "@shared/types";
import type { wizardChanges } from "../../configurationWizardModel";
import { STEP_COUNT } from "./wizardSteps";
import classes from "./ConfigurationWizard.module.css";

interface Props {
  activeStep: number;
  saving: boolean;
  draftDirty: boolean;
  changes: ReturnType<typeof wizardChanges>;
  clusterPathSelected: boolean;
  clusterTemplate: ClusterIniTemplate | null;
  serverActive: boolean;
  onCancel: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onApply: () => void;
  onViewChanges: () => void;
}

export function WizardFooter(props: Props): ReactElement {
  const {
    activeStep,
    saving,
    draftDirty,
    changes,
    clusterPathSelected,
    clusterTemplate,
    serverActive,
    onCancel,
    onPrevious,
    onNext,
    onApply,
    onViewChanges,
  } = props;

  return (
    <footer className={classes.footer}>
      <Button
        variant="default"
        leftSection={<X size={16} weight="bold" />}
        onClick={onCancel}
        disabled={saving}
      >
        Cancel
      </Button>
      {activeStep !== STEP_COUNT - 1 ? (
        <Button
          variant="subtle"
          color={draftDirty ? "blue" : "gray"}
          size="compact-sm"
          leftSection={<Eye size={15} />}
          onClick={onViewChanges}
          aria-label={
            clusterPathSelected
              ? "View cluster defaults summary"
              : `View ${changes.length} ${changes.length === 1 ? "change" : "changes"}`
          }
        >
          {clusterPathSelected
            ? "Cluster copy"
            : `${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
        </Button>
      ) : (
        <span className={classes.footerCenterSlot} aria-hidden />
      )}
      <Group gap="sm" justify="flex-end" wrap="nowrap">
        <Button
          variant="default"
          leftSection={<ArrowLeft size={16} weight="bold" />}
          onClick={onPrevious}
          disabled={activeStep === 0 || saving}
        >
          Back
        </Button>
        {activeStep < STEP_COUNT - 1 ? (
          <Button rightSection={<ArrowRight size={16} weight="bold" />} onClick={onNext}>
            Continue
          </Button>
        ) : (
          <Button
            leftSection={
              clusterPathSelected ? (
                <CirclesThreePlus size={16} weight="bold" />
              ) : (
                <FloppyDisk size={16} weight="bold" />
              )
            }
            onClick={onApply}
            loading={saving}
            disabled={
              clusterPathSelected
                ? serverActive || clusterTemplate === null
                : changes.length === 0
            }
          >
            {clusterPathSelected ? "Apply cluster defaults" : "Apply changes"}
          </Button>
        )}
      </Group>
    </footer>
  );
}
