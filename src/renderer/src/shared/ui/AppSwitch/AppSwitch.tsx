import { useEffect, useRef, useState, type ReactElement } from "react";
import { Switch, type SwitchProps } from "@mantine/core";

export interface AppSwitchProps extends Omit<SwitchProps, "checked" | "defaultChecked" | "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void | Promise<void>;
}

/** `instanceof Promise` misses custom thenables; `Promise.resolve` handles anything thenable. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function";
}

/**
 * Mantine Switch that paints the knob on the click, for parents whose re-render is heavy.
 *
 * The knob follows the click immediately and the parent's value catches up on its own schedule.
 * An externally driven change (a reload, or a failed write going back) is picked up **during
 * render** with React's documented "adjust state when a prop changes" pattern: that avoids the
 * one-frame stale paint a `useEffect` mirror gives, and keeps render pure - no ref is written
 * while rendering, which concurrent rendering could discard.
 *
 * Failure handling is the same for a synchronous throw and a rejected promise, because the
 * callback is typed as either. The revert target is the last **committed** prop, not the value
 * captured when the click happened: if the parent moves `checked` while the write is in flight,
 * going back to the click-time value would fight the parent.
 */
export function AppSwitch({ checked, onCheckedChange, ...props }: AppSwitchProps): ReactElement {
  const [optimisticChecked, setOptimisticChecked] = useState(checked);
  const [lastPropChecked, setLastPropChecked] = useState(checked);
  const committedRef = useRef(checked);
  const actionRef = useRef(0);

  if (checked !== lastPropChecked) {
    setLastPropChecked(checked);
    setOptimisticChecked(checked);
  }

  // The only place a ref may hold a prop is an effect: it runs after commit, so the revert
  // never reads a value React started and discarded.
  useEffect(() => {
    committedRef.current = checked;
  }, [checked]);

  const revert = (action: number): void => {
    // Only this click's own failure, and only while it is still the latest one: a late
    // rejection must not clobber a newer click's optimistic value.
    if (actionRef.current === action) {
      setOptimisticChecked(committedRef.current);
    }
  };

  return (
    <Switch
      {...props}
      checked={optimisticChecked}
      onChange={(event) => {
        const nextChecked = event.currentTarget.checked;
        const action = ++actionRef.current;
        setOptimisticChecked(nextChecked);
        // Deliberately not inside `startTransition`: this callback persists data, and React is
        // free to discard transition work, which would drop the write with no way to notice.
        try {
          const result = onCheckedChange(nextChecked);
          if (isThenable(result)) {
            void Promise.resolve(result).catch(() => revert(action));
          }
        } catch {
          revert(action);
        }
      }}
    />
  );
}
