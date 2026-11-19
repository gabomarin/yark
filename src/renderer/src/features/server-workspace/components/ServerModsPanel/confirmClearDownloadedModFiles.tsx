import { dangerConfirmBody, openDangerConfirmModal } from "@ui/DangerConfirmModal/openDangerConfirmModal";
import { CLEAR_DOWNLOADED_FILES_LABEL } from "./serverModsRowActions";
import type { ModRow } from "./serverModsModel";

/** Confirm before deleting one mod's local ASA folders (#702). */
export function confirmClearDownloadedModFiles(
  row: Pick<ModRow, "id" | "name" | "noPage">,
  onConfirm: () => void | Promise<void>,
  options?: {
    onPendingChange?: (pending: boolean) => void;
    onError?: (message: string) => void;
  },
): void {
  if (row.id === null) return;
  options?.onPendingChange?.(true);
  let started = false;
  const title =
    row.noPage || row.name === `Project ${row.id}`
      ? `Clear downloaded files for Project ${row.id}?`
      : `Clear downloaded files for ${row.name}?`;
  openDangerConfirmModal({
    title,
    children: dangerConfirmBody(
      <>
        YARK will delete this mod&apos;s files in the server install. ARK downloads them again the next time this server
        starts. The mod stays on this list.
      </>,
    ),
    confirmLabel: CLEAR_DOWNLOADED_FILES_LABEL,
    onClose: () => {
      if (!started) options?.onPendingChange?.(false);
    },
    onCancel: () => options?.onPendingChange?.(false),
    onConfirm: () => {
      started = true;
      void Promise.resolve()
        .then(onConfirm)
        .catch((cause) => {
          options?.onError?.(cause instanceof Error ? cause.message : "Could not clear downloaded files");
        })
        .finally(() => {
          options?.onPendingChange?.(false);
        });
    },
  });
}
