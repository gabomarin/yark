import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import type { OpenConfirmModal } from "@mantine/modals";
import type { ReactNode } from "react";

/** Defaults for destructive `modals.openConfirmModal` calls (#235). */
export const DANGER_CONFIRM_CANCEL_LABEL = "Cancel";

type ConfirmButtonProps = NonNullable<OpenConfirmModal["confirmProps"]>;

export type OpenDangerConfirmModalInput = Omit<
  OpenConfirmModal,
  "labels" | "confirmProps" | "children" | "onConfirm"
> & {
  title: ReactNode;
  /** Confirm button label (required — avoid drifting “OK” / “Confirm”). */
  confirmLabel: string;
  /** Defaults to {@link DANGER_CONFIRM_CANCEL_LABEL}. */
  cancelLabel?: string;
  /**
   * Modal body. Prefer {@link dangerConfirmBody} for plain / mixed text so
   * size stays `sm`. Pass richer nodes (e.g. `Alert`) as-is.
   */
  children: ReactNode;
  /** Merged after forced `color: "red"` (callers cannot override color). */
  confirmProps?: Omit<ConfirmButtonProps, "color">;
  onConfirm: () => void;
};

/**
 * Shared body chrome for danger confirms — `Text size="sm"` (#235).
 * Use for string / mixed strong+text children; skip when the body is already
 * an `Alert` or other composed node.
 */
export function dangerConfirmBody(children: ReactNode): ReactNode {
  return <Text size="sm">{children}</Text>;
}

/**
 * Opens a destructive confirm with consistent red confirm button and Cancel.
 * Prefer this over raw `modals.openConfirmModal` for delete / clear / ban /
 * remove / force-close flows. Do not use for non-destructive confirms
 * (e.g. yellow INI reset-to-defaults, host-port probe, unsaved-leave).
 *
 * Callbacks (Mantine `@mantine/modals`):
 * - `onConfirm` / `onCancel` — confirm / cancel buttons
 * - `onClose` — any dismiss, including ESC and overlay click (via
 *   `handleCloseModal`); Cancel also fires `onCancel` first. Use `onClose`
 *   when cleanup must run on ESC, not only on Cancel.
 */
export function openDangerConfirmModal(
  input: OpenDangerConfirmModalInput,
): string {
  const {
    confirmLabel,
    cancelLabel = DANGER_CONFIRM_CANCEL_LABEL,
    confirmProps,
    ...rest
  } = input;
  return modals.openConfirmModal({
    ...rest,
    labels: { confirm: confirmLabel, cancel: cancelLabel },
    confirmProps: { ...confirmProps, color: "red" },
  });
}
