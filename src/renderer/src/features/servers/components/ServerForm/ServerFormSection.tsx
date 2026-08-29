import type { ReactElement, ReactNode } from "react";
import { Stack, Text, Title } from "@mantine/core";
import classes from "./ServerForm.module.css";

interface Props {
  title?: string;
  /** Optional meta above the title (create Identity / Reachability). */
  eyebrow?: string;
  children: ReactNode;
  /** Embedded edit: compact stack. Page: heading + hairline on the canvas. */
  flat?: boolean;
  fill?: boolean;
  span2?: boolean;
}

export function ServerFormSection({
  title,
  eyebrow,
  children,
  flat = false,
  fill = false,
  span2 = false,
}: Props): ReactElement {
  const spanClass = span2 ? classes.span2 : undefined;
  const eyebrowNode =
    eyebrow !== undefined ? (
      <Text fz={11} c="dimmed" tt="uppercase" lts="0.06em">
        {eyebrow}
      </Text>
    ) : null;

  if (flat) {
    return (
      <Stack gap="xs" className={spanClass}>
        {eyebrowNode}
        {title !== undefined && (
          <Text fw={600} fz="sm">
            {title}
          </Text>
        )}
        {children}
      </Stack>
    );
  }

  return (
    <section
      className={[classes.formSection, spanClass, fill ? classes.sectionFill : undefined]
        .filter(Boolean)
        .join(" ")}
      data-span2={span2 || undefined}
    >
      <Stack gap="sm" className={fill ? classes.sectionFill : undefined}>
        {eyebrowNode}
        {title !== undefined && <Title order={4}>{title}</Title>}
        {children}
      </Stack>
    </section>
  );
}
