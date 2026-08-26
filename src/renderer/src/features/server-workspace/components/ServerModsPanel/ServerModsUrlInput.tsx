import type { ReactElement } from "react";
import { Button, Group, Progress, Stack, Text, TextInput } from "@mantine/core";
import { LinkSimple } from "@phosphor-icons/react";
import { useUiDensity } from "@app/AppProviders";
import type { ModAddImportProgress } from "@shared/mod-add-input";
import { formatModAddImportProgress } from "@shared/mod-add-input";
import { searchFieldIconSize } from "@ui/SearchField/SearchField";
import searchFieldClasses from "@ui/SearchField/SearchField.module.css";
import classes from "./ServerModsPanel.module.css";

interface Props {
  value: string;
  busy: boolean;
  progress: ModAddImportProgress | null;
  onChange: (value: string) => void;
  onAdd: () => void;
}

export function ServerModsUrlInput(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const progressValue =
    props.progress !== null && props.progress.total > 0
      ? (props.progress.completed / props.progress.total) * 100
      : 0;

  return (
    <Stack gap="xs">
      <Group align="flex-end" wrap="wrap">
        <TextInput
          label="Add CurseForge Project ID or mod URL"
          description="Paste a Project ID (e.g. 928793) or a CurseForge ASA mod page URL. New mods start disabled until you enable them for Start."
          placeholder="928793, https://www.curseforge.com/ark-survival-ascended/mods/..."
          size={size}
          leftSection={<LinkSimple size={searchFieldIconSize(size)} />}
          value={props.value}
          disabled={props.busy}
          className={classes.search}
          classNames={{ input: searchFieldClasses.input, section: searchFieldClasses.section }}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !props.busy) props.onAdd();
          }}
        />
        <Button size={size} loading={props.busy} onClick={props.onAdd}>
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
