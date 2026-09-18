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
  /** One-line context under the title (version, path, counts). */
  meta?: ReactNode;
  /** Extra header row under the title/meta (e.g. the What's new tab switcher). */
  headerExtra?: ReactNode;
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
  /** Stacking for dialogs opened from another dialog (lightboxes). */
  zIndex?: number;
  /** Appended to the content class (e.g. a full-height dialog). */
  contentClassName?: string;
  /** Extra data-* hooks forwarded to the dialog content. */
  [key: `data-${string}`]: unknown;
  children: ReactNode;
}

/**
 * The dialog atom: one chrome for every panel-style modal (radius, overlay,
 * header, title, body, footer). Prefer this over a raw Mantine `Modal` so
 * dialogs stop inventing their own chrome — see #PUX-004.
 */
export function AppPanelModal(props: Props): ReactElement {
  const {
    opened,
    onClose,
    title,
    meta,
    headerExtra,
    size: sizeProp,
    footer,
    footerAlign,
    centered,
    overlayOpacity,
    withCloseButton,
    closeOnClickOutside,
    closeOnEscape,
    zIndex,
    contentClassName,
    children,
    ...dataAttributes
  } = props;
  const size =
    typeof sizeProp === "string" && sizeProp in SIZE_PX
      ? SIZE_PX[sizeProp as AppModalSize]
      : (sizeProp ?? SIZE_PX.lg);

  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      centered={centered ?? true}
      size={size}
      radius="md"
      closeOnClickOutside={closeOnClickOutside ?? true}
      closeOnEscape={closeOnEscape ?? true}
      zIndex={zIndex}
      classNames={{
        content: [classes.content, contentClassName].filter(Boolean).join(" "),
        header: classes.header,
        body: classes.body,
        title: classes.title,
      }}
    >
      <Modal.Overlay
        backgroundOpacity={overlayOpacity ?? 0.5}
        color="#000"
        data-app-modal-overlay
      />
      <Modal.Content radius="md" {...dataAttributes}>
        <Modal.Header>
          <div className={classes.headerTop}>
            <div>
              <Modal.Title>{title}</Modal.Title>
              {meta === undefined || meta === null || meta === "" ? null : (
                <Text size="xs" className={classes.meta}>
                  {meta}
                </Text>
              )}
            </div>
            {withCloseButton === false ? null : (
              /* Not "Close": several dialogs have their own "Close" action button. */
              <Modal.CloseButton aria-label="Close dialog" />
            )}
          </div>
          {headerExtra !== undefined && (
            <div className={classes.headerExtra}>{headerExtra}</div>
          )}
        </Modal.Header>
        <Modal.Body>
          <div className={classes.bodyContent}>{children}</div>
          {footer !== undefined && (
            <div className={classes.footer} data-align={footerAlign ?? "end"}>
              {footer}
            </div>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
