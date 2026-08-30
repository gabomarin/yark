import {
  dangerConfirmBody,
  openDangerConfirmModal,
} from "@ui/DangerConfirmModal/openDangerConfirmModal";
import type { ModRow } from "./serverModsModel";

/** Confirm before removing a configured mod (table, context menu, drawer). */
export function confirmRemoveServerMod(
  row: Pick<ModRow, "id" | "name">,
  onRemove: (id: string) => void | Promise<void | boolean>,
  options?: {
    /** Fires when the confirm modal opens or closes (any outcome). */
    onPendingChange?: (pending: boolean) => void;
  },
): void {
  if (row.id === null) return;
  options?.onPendingChange?.(true);
  let removeStarted = false;
  openDangerConfirmModal({
    title: "Remove mod?",
    children: dangerConfirmBody(
      <>
        Remove <strong>{row.name}</strong> from this server and discard its
        cached metadata?
      </>,
    ),
    confirmLabel: "Remove mod",
    // Mantine confirm: Cancel button → onCancel; ESC / overlay → onClose only
    // (ModalsProvider hardcodes Modal.onClose, then handleCloseModal runs props.onClose).
    onClose: () => {
      if (!removeStarted) {
        options?.onPendingChange?.(false);
      }
    },
    onCancel: () => options?.onPendingChange?.(false),
    onConfirm: () => {
      removeStarted = true;
      void Promise.resolve(onRemove(row.id!)).finally(() => {
        options?.onPendingChange?.(false);
      });
    },
  });
}
