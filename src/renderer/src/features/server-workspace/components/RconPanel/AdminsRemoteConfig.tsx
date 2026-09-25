import { Button, NumberInput, Stack } from "@mantine/core";
import type { ReactElement } from "react";
import { ADMIN_LIST_URL_CONSUMER } from "@shared/settings/hosted-resource-consumers";
import { HostedResourceSelector } from "@features/hosted-resources/components/HostedResourceSelector/HostedResourceSelector";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { ADMIN_LIST_MIN_INTERVAL_SEC } from "./adminListFormConstants";
import classes from "./RconPanel.module.css";

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
    <AppSurfaceCard tone="flat" padding="sm" radius={0} className={classes.sourceCard}>
      <Stack gap="sm">
        <HostedResourceSelector
          consumer={ADMIN_LIST_URL_CONSUMER}
          value={props.urlDraft}
          size="xs"
          disabled={readOnly}
          onChange={props.onUrlChange}
        />
        <NumberInput
          label="Refresh interval (seconds)"
          description={`How often ASA re-fetches the list (min ${ADMIN_LIST_MIN_INTERVAL_SEC}).`}
          size="xs"
          min={ADMIN_LIST_MIN_INTERVAL_SEC}
          value={props.intervalDraft}
          disabled={readOnly}
          readOnly={readOnly}
          onChange={props.onIntervalChange}
        />
        {!readOnly ? (
          <Button size="xs" variant="default" loading={props.validating} onClick={props.onValidateUrl}>
            Validate
          </Button>
        ) : null}
      </Stack>
    </AppSurfaceCard>
  );
}
