import type { ReactElement } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import classes from "./ServerModsPanel.module.css";

export const UNVERIFIED_ADD_BODY =
  "YARK can still add this Project ID. It stays off until you enable it. Start will load that ID.";

const UNVERIFIED_ADD_BODY_PLURAL =
  "YARK can still add these Project IDs. They stay off until you enable them. Start will load those IDs.";

const UNVERIFIED_ADD_ACTION_LABEL = "Add Project ID";

export function unverifiedAddAlertTitle(ids: readonly string[]): string {
  if (ids.length === 1) return `No CurseForge page for ${ids[0]}`;
  return `No CurseForge page for ${ids.join(", ")}`;
}

interface Props {
  ids: string[];
  busy: boolean;
  onAdd: () => void;
  onDismiss: () => void;
}

/** Attention alert after Add fails to verify numeric Project IDs (#698). */
export function ServerModsUnverifiedAddAlert(props: Props): ReactElement | null {
  if (props.ids.length === 0) return null;
  const plural = props.ids.length > 1;
  return (
    <AppAlert
      className={classes.statusAlert}
      classNames={{ wrapper: classes.statusAlertWrapper }}
      color="attention"
      title={unverifiedAddAlertTitle(props.ids)}
      withCloseButton
      onClose={props.onDismiss}
    >
      <Stack gap="sm">
        <Text size="sm">{plural ? UNVERIFIED_ADD_BODY_PLURAL : UNVERIFIED_ADD_BODY}</Text>
        <Group>
          <Button size="xs" variant="default" loading={props.busy} onClick={props.onAdd}>
            {UNVERIFIED_ADD_ACTION_LABEL}
          </Button>
        </Group>
      </Stack>
    </AppAlert>
  );
}
