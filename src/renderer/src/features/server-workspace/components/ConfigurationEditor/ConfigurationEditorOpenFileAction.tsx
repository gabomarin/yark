import type { ReactElement } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { ActionIcon, Text, Tooltip } from "@mantine/core";

interface Props {
  fileLabel: string;
  filePath: string;
  iconSize: "sm" | "md";
  glyphSize: number;
  busy: boolean;
  onOpen: () => void;
}

export function ConfigurationEditorOpenFileAction(props: Props): ReactElement {
  const { fileLabel, filePath, iconSize, glyphSize, busy, onOpen } = props;

  return (
    <Tooltip
      label={
        <div>
          <Text size="xs" fw={600}>
            Open {fileLabel} in the default editor
          </Text>
          <Text size="xs" ff="monospace">
            {filePath}
          </Text>
        </div>
      }
      multiline
      maw={420}
      withArrow
    >
      <span>
        <ActionIcon
          size={iconSize}
          variant="default"
          aria-label={`Open ${fileLabel}`}
          onClick={onOpen}
          disabled={busy}
        >
          <ArrowSquareOut size={glyphSize} />
        </ActionIcon>
      </span>
    </Tooltip>
  );
}
