import { Text } from "@mantine/core";
import classes from "./ServerCard.module.css";

interface Props {
  label: string;
  value: string;
  tone?: "default" | "muted" | "ok" | "warn";
}

export function ServerCardMetaItem({
  label,
  value,
  tone = "default",
}: Props): JSX.Element {
  return (
    <div className={classes.metaItem}>
      <Text c="dimmed" tt="uppercase" lts={0.04} display="block" fz="xs">
        {label}
      </Text>
      <Text className={classes[`metaValue-${tone}`]} display="block" lineClamp={1} fz="xs">
        {value}
      </Text>
    </div>
  );
}
