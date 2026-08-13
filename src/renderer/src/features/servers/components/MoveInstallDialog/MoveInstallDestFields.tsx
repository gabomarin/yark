import type { ReactElement } from "react";
import { Alert, Checkbox, Stack, Text } from "@mantine/core";
import { PathField } from "@ui/PathField/PathField";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";

interface Props {
  pickedDir: string;
  createFolder: boolean;
  folderName: string;
  resolvedDest: string;
  browsing: boolean;
  previewIssue: string | null;
  onBrowse: () => void;
  onCreateFolderChange: (value: boolean) => void;
}

export function MoveInstallDestFields(props: Props): ReactElement {
  return (
    <>
      <PathField
        label={
          props.createFolder
            ? "Destination base folder"
            : "Destination install directory"
        }
        placeholder={
          props.createFolder ? "C:\\ark_servers" : "C:\\ark_servers\\my_server_new"
        }
        description={
          props.createFolder
            ? "The new folder must be empty. The previous install is removed after a successful move."
            : "Destination must be empty (no files or subfolders). The previous install is removed after a successful move."
        }
        value={props.pickedDir}
        required
        onChange={() => undefined}
        onBrowse={props.onBrowse}
        busy={props.browsing}
      />
      <Checkbox
        label={`Create folder "${props.folderName}"`}
        checked={props.createFolder}
        onChange={(event) =>
          props.onCreateFolderChange(event.currentTarget.checked)
        }
      />
      {props.createFolder && (
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            Final install path
          </Text>
          <ReadonlyPath
            value={props.resolvedDest.length > 0 ? props.resolvedDest : null}
            emptyLabel="pick a base folder"
            compact
          />
        </Stack>
      )}
      {props.previewIssue !== null && (
        <Alert color="red" title="Destination path">
          <Text size="sm">{props.previewIssue}</Text>
        </Alert>
      )}
    </>
  );
}
