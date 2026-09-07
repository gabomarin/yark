import type { ReactElement } from "react";
import { Text } from "@mantine/core";
import { AppPanelConfirmModal } from "@ui/AppPanelConfirmModal/AppPanelConfirmModal";

interface Props {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Quit confirm — panel chrome aligned with What's new (#532). */
export function QuitYarkModal(props: Props): ReactElement {
  return (
    <AppPanelConfirmModal
      opened={props.opened}
      onClose={props.onClose}
      onConfirm={props.onConfirm}
      title="Quit YARK?"
      meta="Closes the server manager on this PC"
      confirmLabel="Quit YARK"
      contentProps={{ "data-yark-quit-modal": "" }}
      titleProps={{ "data-yark-quit-modal-title": "" }}
      confirmProps={{ "data-yark-quit-confirm": "" }}
    >
      <Text size="sm">
        Any servers that are still running will be stopped safely first.
      </Text>
    </AppPanelConfirmModal>
  );
}
