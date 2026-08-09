import type { ReactElement, ReactNode } from "react";
import { Menu } from "@mantine/core";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { RowActionMenuItems } from "./RowActionMenuItems";
import {
  normalizeRowActionEntries,
  visibleRowActionItems,
  type RowActionEntry,
} from "./rowActionModel";

interface RowActionMenuState {
  sourceId: string;
  entries: RowActionEntry[];
  x: number;
  y: number;
}

interface RowActionMenuContextValue {
  openAt: (
    sourceId: string,
    entries: readonly RowActionEntry[],
    x: number,
    y: number,
  ) => void;
  /** Keep an already-open menu in sync with live row/card actions. */
  sync: (sourceId: string, entries: readonly RowActionEntry[]) => void;
  closeSource: (sourceId: string) => void;
  close: () => void;
}

const RowActionMenuContext = createContext<RowActionMenuContextValue | null>(
  null,
);

export function useRowActionMenuApi(): RowActionMenuContextValue {
  const value = useContext(RowActionMenuContext);
  if (value === null) {
    throw new Error("useRowActionMenuApi requires RowActionMenuProvider");
  }
  return value;
}

interface Props {
  children: ReactNode;
}

/**
 * Hosts one shared Mantine `Menu` for right-click row actions so context menus
 * reuse the same dropdown chrome as kebabs.
 */
export function RowActionMenuProvider(props: Props): ReactElement {
  const [state, setState] = useState<RowActionMenuState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const close = useCallback(() => {
    setState(null);
  }, []);

  const closeSource = useCallback((sourceId: string) => {
    if (stateRef.current?.sourceId !== sourceId) return;
    setState(null);
  }, []);

  const openAt = useCallback(
    (
      sourceId: string,
      entries: readonly RowActionEntry[],
      x: number,
      y: number,
    ) => {
      const normalized = normalizeRowActionEntries(entries);
      if (visibleRowActionItems(normalized).length === 0) return;
      setState({ sourceId, entries: normalized, x, y });
    },
    [],
  );

  const sync = useCallback((sourceId: string, entries: readonly RowActionEntry[]) => {
    const current = stateRef.current;
    // Closed menus: skip setState so every row mount does not schedule updates.
    if (current === null || current.sourceId !== sourceId) return;
    const normalized = normalizeRowActionEntries(entries);
    if (visibleRowActionItems(normalized).length === 0) {
      setState(null);
      return;
    }
    setState({ ...current, entries: normalized });
  }, []);

  const api = useMemo(
    () => ({ openAt, sync, closeSource, close }),
    [openAt, sync, closeSource, close],
  );
  const opened = state !== null;

  return (
    <RowActionMenuContext.Provider value={api}>
      {props.children}
      <Menu
        opened={opened}
        onChange={(next) => {
          if (!next) close();
        }}
        shadow="md"
        position="bottom-start"
        withinPortal
        middlewares={{ flip: true, shift: true }}
        closeOnItemClick
      >
        <Menu.Target>
          {/*
            Positioning anchor for the shared context menu. Keep it focusable
            (tabIndex=-1, not aria-hidden) so Menu focus-return has a real node.
            Keyboard operators still use per-row kebabs / action buttons.
          */}
          <div
            tabIndex={-1}
            data-row-action-menu-anchor
            style={{
              position: "fixed",
              left: state?.x ?? 0,
              top: state?.y ?? 0,
              width: 1,
              height: 1,
              pointerEvents: "none",
            }}
          />
        </Menu.Target>
        <Menu.Dropdown data-row-action-context-menu>
          {state !== null ? (
            <RowActionMenuItems entries={state.entries} />
          ) : null}
        </Menu.Dropdown>
      </Menu>
    </RowActionMenuContext.Provider>
  );
}
