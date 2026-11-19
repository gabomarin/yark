import type { ReactElement } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { Broom, FolderOpen } from "@phosphor-icons/react";
import {
  CLEAR_DOWNLOADED_FILES_LABEL,
  NO_LOCAL_MOD_FILES_YET,
  OPEN_LOCAL_FOLDER_LABEL,
  clearDownloadedFilesHint,
} from "./serverModsRowActions";
import type { ModRow } from "./serverModsModel";

interface Props {
  row: ModRow;
  busy: boolean;
  serverActive: boolean;
  hasLocalFiles: boolean;
  onOpenLocalFolder?: (row: ModRow) => void;
  onClearDownloadedFiles?: (row: ModRow) => void;
}

/** Open local folder + Clear downloaded files icons (#702). */
export function ServerModsLocalFileActions(props: Props): ReactElement | null {
  const { row } = props;
  if (row.id === null) return null;
  if (props.onOpenLocalFolder === undefined && props.onClearDownloadedFiles === undefined) return null;

  const openDisabled = props.busy || !props.hasLocalFiles;
  const clearDisabled = props.busy || props.serverActive || !props.hasLocalFiles;

  return (
    <>
      {props.onOpenLocalFolder !== undefined ? (
        <Tooltip label={props.hasLocalFiles ? OPEN_LOCAL_FOLDER_LABEL : NO_LOCAL_MOD_FILES_YET} withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`${OPEN_LOCAL_FOLDER_LABEL} ${row.name}`}
            disabled={openDisabled}
            onClick={() => props.onOpenLocalFolder?.(row)}
          >
            <FolderOpen size={16} />
          </ActionIcon>
        </Tooltip>
      ) : null}
      {props.onClearDownloadedFiles !== undefined ? (
        <Tooltip
          label={clearDownloadedFilesHint({
            hasLocalFiles: props.hasLocalFiles,
            serverActive: props.serverActive,
          })}
          withArrow
        >
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={`${CLEAR_DOWNLOADED_FILES_LABEL} ${row.name}`}
            disabled={clearDisabled}
            onClick={() => props.onClearDownloadedFiles?.(row)}
          >
            <Broom size={16} />
          </ActionIcon>
        </Tooltip>
      ) : null}
    </>
  );
}
