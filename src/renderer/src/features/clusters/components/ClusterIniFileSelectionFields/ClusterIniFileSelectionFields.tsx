import type { ReactElement } from "react";
import { Checkbox, Stack, Text } from "@mantine/core";
import {
  clusterIniFileSelectionHasWork,
} from "@shared/cluster-ini-file-selection";
import type { ClusterIniTemplateFileSelection } from "@shared/types";

interface Props {
  value: ClusterIniTemplateFileSelection;
  disabled?: boolean;
  description?: string;
  onChange: (next: ClusterIniTemplateFileSelection) => void;
}

export function ClusterIniFileSelectionFields(props: Props): ReactElement {
  const disabled = props.disabled === true;
  const hasWork = clusterIniFileSelectionHasWork(props.value);

  return (
    <Stack gap="xs">
      {props.description !== undefined && (
        <Text size="sm" c="dimmed">
          {props.description}
        </Text>
      )}
      <Checkbox
        checked={props.value.gameUserSettings}
        disabled={disabled}
        onChange={(event) =>
          props.onChange({
            ...props.value,
            gameUserSettings: event.currentTarget.checked,
          })
        }
        label="GameUserSettings.ini"
      />
      <Checkbox
        checked={props.value.game}
        disabled={disabled}
        onChange={(event) =>
          props.onChange({
            ...props.value,
            game: event.currentTarget.checked,
          })
        }
        label="Game.ini"
      />
      {!hasWork && (
        <Text size="sm" c="red">
          Select at least one INI file.
        </Text>
      )}
    </Stack>
  );
}
