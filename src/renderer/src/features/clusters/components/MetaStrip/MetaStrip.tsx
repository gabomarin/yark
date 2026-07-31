import { Text } from "@mantine/core";
import type { ReactNode, ReactElement } from "react";
import classes from "./MetaStrip.module.css";

export interface MetaStripItem {
  label: string;
  value: ReactNode;
}

interface Props {
  items: MetaStripItem[];
  className?: string;
}

/** Feature-local label/value strip for cluster detail. Promote to shared/ui only on a second real use. */
export function MetaStrip({ items, className }: Props): ReactElement {
  return (
    <div className={[classes.strip, className].filter(Boolean).join(" ")}>
      {items.map((item) => (
        <div key={item.label} className={classes.item}>
          <Text size="xs" c="dimmed" className={classes.label}>
            {item.label}
          </Text>
          <div className={classes.value}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
