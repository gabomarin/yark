import type { MouseEventHandler } from "react";
import { useEffect, useId, useRef } from "react";
import {
  normalizeRowActionEntries,
  rowActionFingerprint,
  visibleRowActionItems,
  type RowActionEntry,
} from "./rowActionModel";
import { useRowActionMenuApi } from "./RowActionMenuProvider";

/**
 * Right-click handler that opens the shared Mantine `Menu` used by kebabs.
 * Only claims the event when a menu will actually open.
 */
export function useRowContextMenu(
  entries: readonly RowActionEntry[],
  options?: { disabled?: boolean },
): MouseEventHandler {
  const sourceId = useId();
  const { openAt, sync, closeSource } = useRowActionMenuApi();
  const disabled = options?.disabled === true;
  const fingerprint = rowActionFingerprint(entries);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const canOpen =
    !disabled && visibleRowActionItems(normalizeRowActionEntries(entries)).length > 0;

  useEffect(() => {
    if (disabled) {
      closeSource(sourceId);
      return;
    }
    sync(sourceId, entriesRef.current);
  }, [closeSource, disabled, fingerprint, sourceId, sync]);

  return (event) => {
    if (!canOpen) return;
    event.preventDefault();
    event.stopPropagation();
    openAt(sourceId, entriesRef.current, event.clientX, event.clientY);
  };
}
