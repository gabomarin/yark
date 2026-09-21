import { startTransition, useEffect, useRef, useState, type ReactElement } from "react";
import { Switch, type SwitchProps } from "@mantine/core";

export interface AppSwitchProps extends Omit<SwitchProps, "checked" | "defaultChecked" | "onChange"> {
  checked: boolean;
  deferChange?: boolean;
  onCheckedChange: (checked: boolean) => void | Promise<void>;
}

/** Mantine Switch with an immediate optimistic paint for render-heavy parents. */
export function AppSwitch({ checked, deferChange = false, onCheckedChange, ...props }: AppSwitchProps): ReactElement {
  const [optimisticChecked, setOptimisticChecked] = useState(checked);
  const checkedRef = useRef(checked);
  const actionRef = useRef(0);

  checkedRef.current = checked;
  useEffect(() => setOptimisticChecked(checked), [checked]);

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
            const reconcile = () => {
              if (actionRef.current === action) setOptimisticChecked(checkedRef.current);
            };
            void result.then(reconcile, reconcile);
          }
        };
        if (deferChange) startTransition(applyChange);
        else applyChange();
      }}
    />
  );
}
