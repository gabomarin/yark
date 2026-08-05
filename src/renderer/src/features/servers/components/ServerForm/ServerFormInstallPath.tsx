import type { ReactElement } from "react";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import { ServerFormPathField } from "./ServerFormPathField";

interface Props {
  isCreate: boolean;
  installDir: string;
  resolvedInstallPreview: string;
  inputSize: "xs" | "sm" | "md";
  browsingInstallDir: boolean;
  moveDisabled: boolean;
  moveDisabledReason: string | undefined;
  onInstallDirChange: (value: string) => void;
  onBrowseInstallDir: () => void;
  onOpenMove: () => void;
}

/** Create-time base folder picker vs edit-time read-only path + Move. */
export function ServerFormInstallPath(props: Props): ReactElement {
  if (props.isCreate) {
    return (
      <>
        <ServerFormPathField
          label="Base folder"
          value={props.installDir}
          placeholder="C:\\ark_servers"
          busy={props.browsingInstallDir}
          size={props.inputSize}
          onChange={props.onInstallDirChange}
          onBrowse={props.onBrowseInstallDir}
        />
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            Final install path
          </Text>
          <ReadonlyPath
            value={
              props.resolvedInstallPreview.length > 0
                ? props.resolvedInstallPreview
                : null
            }
            emptyLabel="pick a base folder and name"
            compact
          />
        </Stack>
      </>
    );
  }

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Install directory
      </Text>
      <ReadonlyPath value={props.installDir} compact />
      <Group>
        <Button
          size={props.inputSize}
          variant="light"
          leftSection={<ArrowsLeftRight size={16} />}
          disabled={props.moveDisabled}
          onClick={props.onOpenMove}
          title={props.moveDisabledReason}
        >
          Move installation…
        </Button>
      </Group>
    </Stack>
  );
}
