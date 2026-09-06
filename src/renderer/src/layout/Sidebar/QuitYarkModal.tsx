import type { ReactElement } from "react";
import { Button, Modal, Text } from "@mantine/core";
import classes from "./QuitYarkModal.module.css";

interface Props {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Quit confirm — panel chrome aligned with What's new (#532). */
export function QuitYarkModal(props: Props): ReactElement {
  return (
    <Modal.Root
      opened={props.opened}
      onClose={props.onClose}
      centered
      size={420}
      radius="md"
      classNames={{
        content: classes.content,
        header: classes.header,
        body: classes.body,
        title: classes.title,
      }}
    >
      <Modal.Overlay backgroundOpacity={0.5} color="#000" />
      <Modal.Content radius="md" data-yark-quit-modal>
        <Modal.Header>
          <div className={classes.headerTop}>
            <div>
              <Modal.Title data-yark-quit-modal-title>Quit YARK?</Modal.Title>
              <Text size="xs" className={classes.meta}>
                Closes the server manager on this PC
              </Text>
            </div>
            <Modal.CloseButton aria-label="Close" />
          </div>
        </Modal.Header>

        <Modal.Body>
          <div className={classes.copy}>
            <Text size="sm">
              Any servers that are still running will be stopped safely first.
            </Text>
          </div>

          <div className={classes.footer}>
            <Button
              size="compact-xs"
              variant="subtle"
              radius="md"
              onClick={props.onClose}
            >
              Cancel
            </Button>
            <Button
              size="compact-xs"
              radius="md"
              color="red"
              onClick={props.onConfirm}
              data-yark-quit-confirm
            >
              Quit YARK
            </Button>
          </div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
