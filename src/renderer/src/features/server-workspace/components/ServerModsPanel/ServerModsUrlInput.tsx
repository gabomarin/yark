import type { ReactElement } from "react";
import { ActionIcon, Button, Group, Progress, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { Info, LinkSimple, Plus } from "@phosphor-icons/react";
import { useUiDensity } from "@app/AppProviders";
import type { ModAddImportProgress } from "@shared/mods/mod-add-input";
import { formatModAddImportProgress } from "@shared/mods/mod-add-input";
import { searchFieldIconSize } from "@ui/SearchField/SearchField";
import searchFieldClasses from "@ui/SearchField/SearchField.module.css";
import classes from "./ServerModsPanel.module.css";

/** Full help — empty-state description and compact-field tooltip (#636). */
export const MOD_ADD_HELP =
  "Paste one or more Project IDs or ASA CurseForge mod URLs (commas, spaces, or new lines). New mods start disabled until you enable them for Start.";

interface Props {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onAdd: () => void;
  /**
   * `prominent` — empty inventory: full-width field + visible description.
   * `compact` — inventory toolbar: short label, tooltip for help, shares the row with filters.
   */
  variant?: "prominent" | "compact";
}

interface ProgressProps {
  progress: ModAddImportProgress;
}

/** Full-width import progress under the Add/filter toolbar. */
export function ServerModsAddProgress(props: ProgressProps): ReactElement {
  const progressValue = props.progress.total > 0 ? (props.progress.completed / props.progress.total) * 100 : 0;
  return (
    <Stack gap={4} className={classes.addProgress}>
      <Text size="sm" c="dimmed">
        {formatModAddImportProgress(props.progress)}
        {props.progress.failed > 0 ? ` · ${props.progress.failed} failed` : ""}
      </Text>
      <Progress value={progressValue} size="sm" radius="sm" aria-label={formatModAddImportProgress(props.progress)} />
    </Stack>
  );
}

export function ServerModsUrlInput(props: Props): ReactElement {
  const density = useUiDensity();
  const size = density === "compact" ? "xs" : "sm";
  const compact = props.variant === "compact";

  return (
    <Group
      align="flex-end"
      wrap="nowrap"
      gap="sm"
      className={compact ? classes.addCompact : classes.addProminent}
      data-mods-add={compact ? "compact" : "prominent"}
    >
      <TextInput
        label={compact ? "Add" : "Add CurseForge Project ID or mod URL"}
        description={compact ? undefined : MOD_ADD_HELP}
        placeholder={compact ? "Project ID or CurseForge URL" : "928793, 929420, https://www.curseforge.com/ark-survival-ascended/mods/..."}
        size={size}
        leftSection={<LinkSimple size={searchFieldIconSize(size)} />}
        rightSection={
          compact ? (
            <Tooltip label={MOD_ADD_HELP} multiline maw={320} withArrow>
              <ActionIcon variant="subtle" size={size} aria-label="How to add mods" color="gray">
                <Info size={searchFieldIconSize(size)} />
              </ActionIcon>
            </Tooltip>
          ) : undefined
        }
        rightSectionPointerEvents={compact ? "all" : undefined}
        value={props.value}
        disabled={props.busy}
        className={compact ? classes.addCompactField : classes.search}
        classNames={{ input: searchFieldClasses.input, section: searchFieldClasses.section }}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !props.busy) props.onAdd();
        }}
      />
      <Button
        size={size}
        loading={props.busy}
        leftSection={<Plus size={searchFieldIconSize(size)} />}
        className={classes.addButton}
        // Size tokens set --button-height inline; override from the parent row
        // token (--mods-add-control-height) so we match the Add TextInput.
        styles={{
          root: {
            "--button-height": "var(--mods-add-control-height)",
            height: "var(--mods-add-control-height)",
            minHeight: "var(--mods-add-control-height)",
            paddingBlock: 0,
          },
        }}
        onClick={props.onAdd}
      >
        Add
      </Button>
    </Group>
  );
}
