import type { ReactElement } from "react";
import { Alert, Stack, Text } from "@mantine/core";
import type { suggestMapTokenFromMetadata } from "@shared/map-token-suggest";
import { MAP_NAME_COPY } from "@shared/map-name-copy";
import { CopyMetadataRow } from "@ui/CopyMetadataRow/CopyMetadataRow";
import { mapFieldHelperTextProps } from "@ui/mapFieldStyles";
import classes from "./MapNameHint.module.css";

type Suggestion = ReturnType<typeof suggestMapTokenFromMetadata>;

interface Props {
  suggestion: Suggestion;
  /** `alert` — standalone; `inline` — detail header; `embedded` — inside Map mod alert. */
  variant?: "alert" | "inline" | "embedded";
}

export function MapNameHint(props: Props): ReactElement {
  const variant = props.variant ?? "alert";

  if (props.suggestion === null) {
    const missing = (
      <Text size="sm">
        {variant === "embedded"
          ? MAP_NAME_COPY.setUnderCustom
          : MAP_NAME_COPY.notInferredFromCf}
      </Text>
    );
    if (variant === "inline") {
      return (
        <Stack gap={2} className={classes.inlineRoot}>
          <Text c="dimmed" tt="uppercase" fw={500} {...mapFieldHelperTextProps}>
            {MAP_NAME_COPY.label}
          </Text>
          <Text {...mapFieldHelperTextProps} c="yellow">
            {MAP_NAME_COPY.notInferredFromCf}
          </Text>
        </Stack>
      );
    }
    if (variant === "embedded") {
      return missing;
    }
    return (
      <Alert variant="light" color="yellow" title={MAP_NAME_COPY.notInferredTitle} radius="md">
        {missing}
      </Alert>
    );
  }

  const title =
    props.suggestion.source === "labeled"
      ? MAP_NAME_COPY.inferred
      : MAP_NAME_COPY.possible;

  const copyControl = (
    <CopyMetadataRow
      label={MAP_NAME_COPY.label}
      value={props.suggestion.token}
      failureMessage={MAP_NAME_COPY.copyFailure}
      warn={props.suggestion.source === "bare"}
    />
  );

  if (variant === "inline") {
    return (
      <Stack gap={2} className={classes.inlineRoot}>
        {copyControl}
        {props.suggestion.source === "bare" ? (
          <Text {...mapFieldHelperTextProps} c="yellow">
            {MAP_NAME_COPY.verifyOnCurseForge}
          </Text>
        ) : null}
      </Stack>
    );
  }

  if (variant === "embedded") {
    return (
      <Stack gap="xs">
        {copyControl}
        <Text size="sm">{MAP_NAME_COPY.chooseWhenReady}</Text>
      </Stack>
    );
  }

  return (
    <Alert variant="light" color="blue" title={title} radius="md">
      <Stack gap="xs">
        {copyControl}
        <Text size="sm">
          {props.suggestion.source === "bare"
            ? MAP_NAME_COPY.verifyOnCurseForge
            : MAP_NAME_COPY.chooseWhenReady}
        </Text>
      </Stack>
    </Alert>
  );
}
