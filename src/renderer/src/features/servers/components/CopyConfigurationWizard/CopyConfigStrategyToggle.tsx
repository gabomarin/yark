import type { ReactElement } from "react";
import { Button, Group, Tooltip } from "@mantine/core";
import type { ConfigTransferIniStrategy } from "@shared/config-transfer";

interface Props {
  strategy: ConfigTransferIniStrategy;
  mergeTooltip: string;
  replaceTooltip: string;
  onChange: (strategy: ConfigTransferIniStrategy) => void;
}

export function CopyConfigStrategyToggle(props: Props): ReactElement {
  return (
    <Group gap="xs">
      <Tooltip label={props.mergeTooltip} multiline w={260}>
        <Button
          size="compact-xs"
          variant={props.strategy === "merge" ? "filled" : "default"}
          onClick={() => props.onChange("merge")}
        >
          Merge
        </Button>
      </Tooltip>
      <Tooltip label={props.replaceTooltip} multiline w={260}>
        <Button
          size="compact-xs"
          variant={props.strategy === "replace" ? "filled" : "default"}
          onClick={() => props.onChange("replace")}
        >
          Replace
        </Button>
      </Tooltip>
    </Group>
  );
}
