import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { canMoveModIdInLoadOrder, moveModIdInLoadOrder, type ModLoadOrderMove, type ModRow } from "./serverModsModel";

/**
 * Explicit load-order moves (context menu + Alt+↑/↓) and focus restore after persist (#638).
 */
export function useServerModsTableLoadOrder(input: {
  mode: "server" | "discover";
  busyKey: string | null;
  loadOrderIds: readonly string[];
  records: ModRow[];
  onReorder: ((orderedIds: string[]) => void) | undefined;
  tableRootRef: RefObject<HTMLDivElement | null>;
  rowsDependency: ModRow[];
}): {
  persistLoadOrderMove: (row: ModRow, move: ModLoadOrderMove) => void;
  onTableKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
} {
  const focusModKeyAfterReorderRef = useRef<string | null>(null);
  const onReorderRef = useRef(input.onReorder);
  useEffect(() => {
    onReorderRef.current = input.onReorder;
  });

  const persistLoadOrderMove = useCallback(
    (row: ModRow, move: ModLoadOrderMove) => {
      if (row.id === null || input.busyKey !== null) return;
      if (!canMoveModIdInLoadOrder(input.loadOrderIds, row.id, move)) return;
      const next = moveModIdInLoadOrder(input.loadOrderIds, row.id, move);
      focusModKeyAfterReorderRef.current = row.key;
      onReorderRef.current?.(next);
    },
    [input.busyKey, input.loadOrderIds],
  );

  useEffect(() => {
    const key = focusModKeyAfterReorderRef.current;
    if (key === null) return;
    focusModKeyAfterReorderRef.current = null;
    const root = input.tableRootRef.current;
    if (root === null) return;
    const target = root.querySelector<HTMLElement>(`[data-mod-key="${CSS.escape(key)}"]`);
    target?.focus();
  }, [input.rowsDependency, input.loadOrderIds, input.tableRootRef]);

  const onTableKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (input.mode !== "server" || input.onReorder === undefined || input.busyKey !== null) return;
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const rowEl = target.closest<HTMLElement>("[data-mod-row]");
      if (rowEl === null) return;
      const key = rowEl.getAttribute("data-mod-key");
      if (key === null) return;
      const row = input.records.find((candidate) => candidate.key === key);
      if (row === undefined || row.id === null) return;
      const move: ModLoadOrderMove = event.key === "ArrowUp" ? "up" : "down";
      if (!canMoveModIdInLoadOrder(input.loadOrderIds, row.id, move)) return;
      event.preventDefault();
      persistLoadOrderMove(row, move);
    },
    [input.mode, input.onReorder, input.busyKey, input.records, input.loadOrderIds, persistLoadOrderMove],
  );

  return { persistLoadOrderMove, onTableKeyDown };
}
