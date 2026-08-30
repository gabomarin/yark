import type { ReactElement, ReactNode } from "react";
import { Stack, Text, Title } from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "./ServerForm.module.css";

interface Props {
  title?: string;
  /** Optional meta above the title (create Identity / Reachability). */
  eyebrow?: string;
  children: ReactNode;
  fill?: boolean;
  span2?: boolean;
  padding?: "sm" | "md";
}

export function ServerFormSection({
  title,
  eyebrow,
  children,
  fill = false,
  span2 = false,
  padding = "md",
}: Props): ReactElement {
  const spanClass = span2 ? classes.span2 : undefined;
  const eyebrowNode =
    eyebrow !== undefined ? (
      <Text fz={11} c="dimmed" tt="uppercase" lts="0.06em">
        {eyebrow}
      </Text>
    ) : null;

  return (
    <AppSurfaceCard
      tone="flat"
      fill={fill}
      padding={padding}
      radius={0}
      className={[classes.formSection, spanClass].filter(Boolean).join(" ")}
      data-span2={span2 || undefined}
    >
      <Stack gap="sm" className={fill ? classes.sectionFill : undefined}>
        {eyebrowNode}
        {title !== undefined && <Title order={4}>{title}</Title>}
        {children}
      </Stack>
    </AppSurfaceCard>
  );
}
