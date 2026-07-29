import { Text, type MantineColor } from "@mantine/core";
import classes from "./ServerCard.module.css";

export type ServerCardMetaTone =
  | "default"
  | "muted"
  | "ok"
  | "attention"
  | "busy"
  | "warn";

interface Props {
  label: string;
  value: string;
  tone?: ServerCardMetaTone;
}

/** Map status tones → Mantine `c` shades (theme.colors + index). */
function toneToTextColor(tone: Exclude<ServerCardMetaTone, "warn">): MantineColor | undefined {
  switch (tone) {
    case "ok":
      return "ok.5";
    case "attention":
      return "attention.5";
    case "busy":
      return "blue.5";
    case "muted":
      return "dimmed";
    case "default":
      return undefined;
  }
}

function toneToFontWeight(tone: Exclude<ServerCardMetaTone, "warn">): number {
  switch (tone) {
    case "attention":
      return 700;
    case "ok":
    case "busy":
      return 600;
    case "default":
      return 500;
    case "muted":
      return 400;
  }
}

export function ServerCardMetaItem({
  label,
  value,
  tone = "default",
}: Props): JSX.Element {
  const valueTone = tone === "warn" ? "attention" : tone;

  return (
    <div
      className={classes.metaItem}
      data-meta-item
      data-meta-label={label}
      data-meta-tone={valueTone}
    >
      <Text c="dimmed" tt="uppercase" lts={0.04} display="block" fz="xs">
        {label}
      </Text>
      <Text
        className={classes.metaValue}
        c={toneToTextColor(valueTone)}
        fw={toneToFontWeight(valueTone)}
        display="block"
        lineClamp={1}
        fz="xs"
      >
        {value}
      </Text>
    </div>
  );
}
