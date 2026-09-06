import {
  dangerConfirmBody,
  openDangerConfirmModal,
} from "@ui/DangerConfirmModal/openDangerConfirmModal";

/** Confirm before sidebar Quit — same chrome as other destructive confirms (#532). */
export function confirmQuitYark(): void {
  openDangerConfirmModal({
    title: "Quit YARK?",
    children: dangerConfirmBody(
      <>
        Stops every managed server safely (save world, then exit), then closes
        YARK completely. If servers are still running, you will confirm Stop
        next. To keep servers and backups running, close the window instead —
        YARK stays in the tray.
      </>,
    ),
    confirmLabel: "Quit YARK",
    onConfirm: () => {
      void window.api.quitApp();
    },
  });
}
