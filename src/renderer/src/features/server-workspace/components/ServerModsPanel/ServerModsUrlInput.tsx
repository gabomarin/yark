import type { ReactElement } from "react";
import { Button, Group, Progress, Stack, Text, TextInput } from "@mantine/core";
import { LinkSimple } from "@phosphor-icons/react";
import type { ModAddImportProgress } from "@shared/mod-add-input";
import { formatModAddImportProgress } from "@shared/mod-add-input";
import classes from "./ServerModsPanel.module.css";

interface Props {
  value: string;
  busy: boolean;
  progress: ModAddImportProgress | null;
  onChange: (value: string) => void;
  onAdd: () => void;
}

export function ServerModsUrlInput(props: Props): ReactElement {
  const progressValue =
    props.progress !== null && props.progress.total > 0
      ? (props.progress.completed / props.progress.total) * 100
      : 0;

  return (
    <Stack gap="xs">
      <Group align="flex-end" wrap="wrap">
        <TextInput
          label="Add CurseForge Project ID or mod URL"
          description="New Project IDs start disabled. Enable them in the list when you want them on Start."
          placeholder="928793, https://www.curseforge.com/ark-survival-ascended/mods/..."
          leftSection={<LinkSimple size={16} />}
          value={props.value}
          disabled={props.busy}
          className={classes.search}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !props.busy) props.onAdd();
          }}
        />
        <Button loading={props.busy} onClick={props.onAdd}>
          Add mod
        </Button>
      </Group>
      {props.progress !== null && (
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {formatModAddImportProgress(props.progress)}
            {props.progress.failed > 0
              ? ` · ${props.progress.failed} failed`
              : ""}
          </Text>
          <Progress
            value={progressValue}
            size="sm"
            radius="sm"
            aria-label={formatModAddImportProgress(props.progress)}
          />
        </Stack>
      )}
    </Stack>
  );
}
