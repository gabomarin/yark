import { startTransition, useRef, useState, type ReactElement } from "react";
import { Switch, type SwitchProps } from "@mantine/core";

export interface AppSwitchProps extends Omit<SwitchProps, "checked" | "defaultChecked" | "onChange"> {
  checked: boolean;
  /** Run the write in a transition: the knob still paints on the click. */
  deferChange?: boolean;
  onCheckedChange: (checked: boolean) => void | Promise<void>;
}

/**
 * Mantine Switch that paints the knob on the click, for parents whose re-render is heavy.
 *
 * The knob follows the click immediately and the parent's value catches up on its own
 * schedule. An externally driven change (a reload, or a failed write going back) is picked
 * up **during render** with React's documented "adjust state when a prop changes" pattern:
 * that avoids the one-frame stale paint a `useEffect` mirror gives, and keeps render pure -
 * no ref is written while rendering, which concurrent rendering could discard.
 *
 * A failed write reverts to the last committed prop; a successful one is left alone, so a
 * parent that reflects the value later (or never) cannot be snapped backwards.
 */
export function AppSwitch({ checked, deferChange = false, onCheckedChange, ...props }: AppSwitchProps): ReactElement {
  const [optimisticChecked, setOptimisticChecked] = useState(checked);
  const [lastPropChecked, setLastPropChecked] = useState(checked);
  const actionRef = useRef(0);

  if (checked !== lastPropChecked) {
    setLastPropChecked(checked);
    setOptimisticChecked(checked);
  }

  return (
    <Switch
      {...props}
      checked={optimisticChecked}
      onChange={(event) => {
        const nextChecked = event.currentTarget.checked;
        const action = ++actionRef.current;
        setOptimisticChecked(nextChecked);
        const applyChange = () => {
          const result = onCheckedChange(nextChecked);
          if (result instanceof Promise) {
            void result.catch(() => {
              // Only this click's own failure, and only while it is still the latest one:
              // a late rejection must not clobber a newer click's optimistic value.
              if (actionRef.current === action) {
                setOptimisticChecked(checked);
              }
            });
          }
        };
        if (deferChange) startTransition(applyChange);
        else applyChange();
      }}
    />
  );
}
