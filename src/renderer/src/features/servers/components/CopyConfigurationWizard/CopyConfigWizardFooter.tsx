import type { ReactElement } from "react";
import { Button, Group, Text } from "@mantine/core";
import type { CopyConfigurationStep } from "../../copyConfigurationModel";

interface Props {
  step: CopyConfigurationStep;
  canLeaveStep1: boolean;
  canPreview: boolean;
  canApply: boolean;
  loadingPreview: boolean;
  committing: boolean;
  previewCount: number;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onPreview: () => void;
  onApply: () => void;
}

export function CopyConfigWizardFooter(props: Props): ReactElement {
  return (
    <Group justify="space-between">
      <Text size="xs" c="dimmed">
        Nothing is written until you confirm the preview.
      </Text>
      <Group>
        {props.step === 1 ? (
          <Button
            variant="default"
            disabled={props.committing}
            onClick={props.onClose}
          >
            Cancel
          </Button>
        ) : (
          <Button
            variant="default"
            disabled={props.committing}
            onClick={props.onBack}
          >
            Back
          </Button>
        )}
        {props.step === 1 && (
          <Button disabled={!props.canLeaveStep1} onClick={props.onNext}>
            Next
          </Button>
        )}
        {props.step === 2 && (
          <Button
            loading={props.loadingPreview}
            disabled={!props.canPreview}
            onClick={props.onPreview}
          >
            Preview
          </Button>
        )}
        {props.step === 3 && (
          <Button
            loading={props.committing}
            disabled={!props.canApply}
            onClick={props.onApply}
          >
            Apply
            {props.previewCount > 1 ? ` (${props.previewCount})` : ""}
          </Button>
        )}
      </Group>
    </Group>
  );
}
