import type { ReactElement, ReactNode } from "react";
import { Modal, Text } from "@mantine/core";
import classes from "./AppPanelModal.module.css";

/** Named sizes so no modal invents its own px/percent width (#PUX-004). */
export type AppModalSize = "sm" | "md" | "lg" | "xl" | "wide";

const SIZE_PX: Record<AppModalSize, number> = {
  sm: 420,
  md: 560,
  lg: 672,
  xl: 840,
  wide: 1200,
};

interface Props {
  opened: boolean;
  onClose: () => void;
  /** String for plain text, or a node for the rare custom title row. */
  title: ReactNode;
  meta?: string;
  /** Named scale, or a raw value for the rare percent/full-height case. */
  size?: AppModalSize | number | string;
  /** Actions rendered in a bordered bar at the bottom (secondary first). */
  footer?: ReactNode;
  /** `end` (default) for confirmations, `between` for destructive dialogs. */
  footerAlign?: "end" | "between";
  centered?: boolean;
  overlayOpacity?: number;
  withCloseButton?: boolean;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  /** Appended to the content class (e.g. a full-height dialog). */
  contentClassName?: string;
  children: ReactNode;
}

/**
 * The dialog atom: one chrome for every panel-style modal (radius, overlay,
 * header, title, body, footer). Prefer this over a raw Mantine `Modal` so
 * dialogs stop inventing their own chrome — see #PUX-004.
 */
export function AppPanelModal(props: Props): ReactElement {
  const size =
    typeof props.size === "string" && props.size in SIZE_PX
      ? SIZE_PX[props.size as AppModalSize]
      : (props.size ?? SIZE_PX.lg);

  return (
    <Modal.Root
      opened={props.opened}
      onClose={props.onClose}
      centered={props.centered ?? true}
      size={size}
      radius="md"
      closeOnClickOutside={props.closeOnClickOutside ?? true}
      closeOnEscape={props.closeOnEscape ?? true}
      classNames={{
        content: [classes.content, props.contentClassName].filter(Boolean).join(" "),
        header: classes.header,
        body: classes.body,
        title: classes.title,
      }}
    >
      <Modal.Overlay backgroundOpacity={props.overlayOpacity ?? 0.5} color="#000" />
      <Modal.Content radius="md">
        <Modal.Header>
          <div className={classes.headerTop}>
            <div>
              <Modal.Title>{props.title}</Modal.Title>
              {props.meta !== undefined && props.meta.length > 0 ? (
                <Text size="xs" className={classes.meta}>
                  {props.meta}
                </Text>
              ) : null}
            </div>
            {props.withCloseButton === false ? null : (
              <Modal.CloseButton aria-label="Close" />
            )}
          </div>
        </Modal.Header>
        <Modal.Body>
          <div className={classes.bodyContent}>{props.children}</div>
          {props.footer !== undefined && (
            <div
              className={classes.footer}
              data-align={props.footerAlign ?? "end"}
            >
              {props.footer}
            </div>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
