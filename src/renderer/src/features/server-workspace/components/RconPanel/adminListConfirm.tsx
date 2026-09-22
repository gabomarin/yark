import {
  dangerConfirmBody,
  openDangerConfirmModal,
} from "@renderer/shared/ui/DangerConfirmModal/openDangerConfirmModal";
/** Confirm removal before a destructive admin-list edit. */
export function confirmAdminListRemoval(label: string, onConfirm: () => void): void {
  openDangerConfirmModal({
    title: "Remove admin?",
    children: dangerConfirmBody(
      <>
        Remove <strong>{label}</strong> from the admin list?
      </>,
    ),
    confirmLabel: "Remove",
    onConfirm,
  });
}
