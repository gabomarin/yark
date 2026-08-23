import type { ReactElement } from "react";
import { Alert, Text } from "@mantine/core";
import type { IniPreview } from "@shared/types";

interface Props {
  preview: IniPreview;
}

export function ConfigurationEditorPreviewAlert(props: Props): ReactElement {
  const { preview } = props;

  return (
    <Alert color="blue" title="Last saved diff">
      {preview.diff.slice(0, 8).map((entry) => (
        <Text key={`${entry.fileKey}.${entry.section}.${entry.key}`} size="sm">
          [{entry.fileKey}] {entry.section}.{entry.key}: {entry.before ?? "∅"} →{" "}
          {entry.after ?? "∅"}
        </Text>
      ))}
      {preview.diff.length > 8 && (
        <Text size="sm" c="dimmed">
          …and {preview.diff.length - 8} more
        </Text>
      )}
    </Alert>
  );
}
