import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import type { ModRow } from "./serverModsModel";

/** Confirm before removing a configured mod (kebab, trash, and context menu). */
export function confirmRemoveServerMod(
  row: ModRow,
  onRemove: (id: string) => void,
): void {
  if (row.id === null) return;
  modals.openConfirmModal({
    title: "Remove mod?",
    children: (
      <Text size="sm">
        Remove <strong>{row.name}</strong> from this server and discard its
        cached metadata?
      </Text>
    ),
    labels: { confirm: "Remove mod", cancel: "Cancel" },
    confirmProps: { color: "red" },
    onConfirm: () => onRemove(row.id!),
  });
}
