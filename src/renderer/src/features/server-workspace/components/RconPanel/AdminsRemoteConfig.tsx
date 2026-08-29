import {
  Button,
  NumberInput,
  Stack,
  TextInput,
} from "@mantine/core";
import type { ReactElement } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "./RconPanel.module.css";

const MIN_INTERVAL = 3;

export interface AdminsRemoteConfigProps {
  urlDraft: string;
  intervalDraft: number | string;
  validating: boolean;
  readOnly?: boolean;
  onUrlChange: (value: string) => void;
  onIntervalChange: (value: number | string) => void;
  onValidateUrl: () => void;
}

/** Remote AdminListURL + poll interval. */
export function AdminsRemoteConfig(props: AdminsRemoteConfigProps): ReactElement {
  const readOnly = props.readOnly === true;

  return (
    <AppSurfaceCard
      tone="flat"
      padding="sm"
      radius="md"
      className={classes.sourceCard}
    >
      <Stack gap="sm">
        <TextInput
          label="AdminListURL"
          description="Public http(s) URL to a plain-text EOS id list. Leave empty to clear."
          size="xs"
          value={props.urlDraft}
          disabled={readOnly}
          readOnly={readOnly}
          onChange={(event) => props.onUrlChange(event.currentTarget.value)}
          placeholder="https://…"
        />
        <NumberInput
          label="Refresh interval (seconds)"
          description="How often ASA re-fetches the list (min 3)."
          size="xs"
          min={MIN_INTERVAL}
          value={props.intervalDraft}
          disabled={readOnly}
          readOnly={readOnly}
          onChange={props.onIntervalChange}
        />
        {!readOnly ? (
          <Button
            size="xs"
            variant="default"
            loading={props.validating}
            onClick={props.onValidateUrl}
          >
            Validate
          </Button>
        ) : null}
      </Stack>
    </AppSurfaceCard>
  );
}
