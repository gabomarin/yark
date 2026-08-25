import type { ReactElement } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { Anchor, Group, Text, Title } from "@mantine/core";
import { THIRD_PARTY_NOTICES_URL } from "@shared/third-party-notices";
import classes from "../SettingsPage.module.css";

export function SettingsAboutLegalSection(): ReactElement {
  return (
    <section
      className={classes.section}
      aria-labelledby="settings-third-party-notices"
      data-settings-third-party-notices
    >
      <Title order={3} size="h4" id="settings-third-party-notices">
        Third-party notices
      </Title>
      <Text size="sm" c="dimmed">
        Credits for default INI templates, launch-options catalog copy, map
        artwork, and trademarks used in YARK.
      </Text>
      <Group gap="xs" align="center">
        <Anchor
          href={THIRD_PARTY_NOTICES_URL}
          target="_blank"
          rel="noreferrer"
          size="sm"
          data-settings-third-party-notices-link
        >
          <Group gap={4} align="center" component="span" wrap="nowrap">
            <span>View on GitHub</span>
            <ArrowSquareOut size={14} aria-hidden="true" />
          </Group>
        </Anchor>
      </Group>
    </section>
  );
}
