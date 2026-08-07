import type { ReactElement } from "react";
import {
  Badge,
  Group,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  decodeServerPlatformSelection,
  encodeServerPlatformSelection,
  type StructuredLaunchArgState,
  type StructuredLaunchUiOption,
} from "@shared/structured-launch-options";
import classes from "./ServerLaunchPanel.module.css";

interface Props {
  option: StructuredLaunchUiOption;
  selection: StructuredLaunchArgState | undefined;
  inputSize: "xs" | "sm";
  /** When false, dependent rows stay off / non-interactive. */
  dependencyMet?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onValueChange: (value: string) => void;
}

function optionTooltip(option: StructuredLaunchUiOption): string {
  const parts = [option.entry.summary.trim()];
  if (option.entry.details.trim().length > 0) {
    parts.push(option.entry.details.trim());
  }
  return parts.join(" ");
}

export function ServerLaunchOptionRow(props: Props): ReactElement {
  const dependencyMet = props.dependencyMet !== false;
  const enabled = props.selection?.enabled === true && dependencyMet;
  const caution = Boolean(props.option.curation.operatorWarning) && enabled;
  const label =
    props.option.entry.token.split(/[=\s]/)[0] ?? props.option.entry.id;
  const isMulti =
    props.option.curation.multiSelect === true &&
    (props.option.curation.enumOptions?.length ?? 0) > 0;
  const isEnum =
    !isMulti &&
    (props.option.entry.valueType === "enum" ||
      (props.option.curation.enumOptions?.length ?? 0) > 0);
  const showValue = enabled && props.option.entry.valueType !== "flag";

  return (
    <div
      className={`${classes.optionRow} ${
        caution
          ? classes.optionRowCaution
          : enabled
            ? ""
            : classes.optionRowDisabled
      }`}
    >
      <Group align="center" gap="sm" wrap="nowrap">
        <Switch
          checked={enabled}
          size="sm"
          disabled={!dependencyMet}
          aria-label={`Enable ${label}`}
          onChange={(e) => props.onEnabledChange(e.currentTarget.checked)}
        />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6} wrap="nowrap" align="center">
            <Tooltip
              label={optionTooltip(props.option)}
              multiline
              maw={360}
              withArrow
              openDelay={250}
              events={{ hover: true, focus: true, touch: true }}
            >
              <span className={classes.optionLabel} tabIndex={0}>
                {label}
              </span>
            </Tooltip>
            {caution ? (
              <Badge
                size="xs"
                variant="outline"
                styles={{
                  root: {
                    color: "var(--app-color-fossil)",
                    borderColor:
                      "color-mix(in srgb, var(--app-color-fossil) 55%, transparent)",
                  },
                }}
              >
                Caution
              </Badge>
            ) : null}
          </Group>
          {caution ? (
            <Text
              size="xs"
              fw={500}
              style={{ color: "var(--app-color-fossil)" }}
            >
              {props.option.curation.operatorWarning}
            </Text>
          ) : null}
          {showValue ? (
            isMulti ? (
              <MultiSelect
                size={props.inputSize}
                data={[...(props.option.curation.enumOptions ?? [])]}
                value={decodeServerPlatformSelection(props.selection?.value)}
                onChange={(codes) =>
                  props.onValueChange(encodeServerPlatformSelection(codes))
                }
                placeholder="Select platforms"
                searchable={false}
              />
            ) : isEnum ? (
              <Select
                size={props.inputSize}
                data={[...(props.option.curation.enumOptions ?? [])]}
                value={
                  props.selection?.value ??
                  props.option.curation.defaultValue ??
                  null
                }
                onChange={(value) => {
                  if (value !== null) props.onValueChange(value);
                }}
                allowDeselect={false}
              />
            ) : (
              <TextInput
                size={props.inputSize}
                value={props.selection?.value ?? ""}
                onChange={(e) => props.onValueChange(e.currentTarget.value)}
                placeholder={
                  props.option.curation.id.includes("url")
                    ? "http://example.com/dynamicconfig.ini"
                    : props.option.entry.valueType === "csv"
                      ? "928988, 929420"
                      : "value"
                }
              />
            )
          ) : null}
        </Stack>
      </Group>
    </div>
  );
}
