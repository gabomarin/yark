import type { KeyboardEventHandler, MouseEventHandler } from "react";
import { useEffect, useId, useRef } from "react";
import {
  normalizeRowActionEntries,
  rowActionFingerprint,
  visibleRowActionItems,
  type RowActionEntry,
} from "./rowActionModel";
import { useRowActionMenuApi } from "./RowActionMenuProvider";

export type RowContextMenuBindings = {
  onContextMenu: MouseEventHandler;
  onKeyDown: KeyboardEventHandler;
  /** Spread onto the row/card when a menu can open. */
  menuTriggerProps: {
    tabIndex: 0;
    "aria-haspopup": "menu";
  } | Record<string, never>;
};

/**
 * Right-click + Shift+F10 / ContextMenu key → shared Mantine `Menu` used by kebabs (#105, #209).
 * Only claims the event when a menu will actually open.
 */
export function useRowContextMenu(
  entries: readonly RowActionEntry[],
  options?: { disabled?: boolean },
): RowContextMenuBindings {
  const sourceId = useId();
  const { openAt, sync, closeSource } = useRowActionMenuApi();
  const disabled = options?.disabled === true;
  const fingerprint = rowActionFingerprint(entries);
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  });
  const canOpen =
    !disabled && visibleRowActionItems(normalizeRowActionEntries(entries)).length > 0;

  useEffect(() => {
    if (disabled) {
      closeSource(sourceId);
      return;
    }
    sync(sourceId, entriesRef.current);
  }, [closeSource, disabled, fingerprint, sourceId, sync]);

  const openFromPointer: MouseEventHandler = (event) => {
    if (!canOpen) return;
    event.preventDefault();
    event.stopPropagation();
    openAt(sourceId, entriesRef.current, event.clientX, event.clientY);
  };

  const openFromKeyboard: KeyboardEventHandler = (event) => {
    if (!canOpen) return;
    const isContextKey =
      event.key === "ContextMenu" ||
      (event.key === "F10" && event.shiftKey);
    if (!isContextKey) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    openAt(sourceId, entriesRef.current, rect.left + 8, rect.top + 8);
  };

  return {
    onContextMenu: openFromPointer,
    onKeyDown: openFromKeyboard,
    menuTriggerProps: canOpen
      ? { tabIndex: 0, "aria-haspopup": "menu" as const }
      : {},
  };
}
