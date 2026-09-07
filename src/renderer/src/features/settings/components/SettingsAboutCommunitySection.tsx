import type { ReactElement } from "react";
import { Anchor, Group, Text, Title } from "@mantine/core";
import {
  YARK_DISCORD_INVITE_URL,
  YARK_GITHUB_URL,
} from "@shared/yark-community";
import {
  DiscordMarkIcon,
  GithubMarkIcon,
} from "@ui/BrandMarkIcons/BrandMarkIcons";
import classes from "../SettingsPage.module.css";

export function SettingsAboutCommunitySection(): ReactElement {
  return (
    <section
      className={classes.section}
      aria-labelledby="settings-community"
      data-settings-community
    >
      <Title order={3} size="h4" id="settings-community">
        Community
      </Title>
      <Text size="sm" c="dimmed">
        Source, issues, and operator chat for YARK.
      </Text>
      <Group gap="md" align="center" mt={4}>
        <Anchor
          href={YARK_GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          size="sm"
          data-settings-community-github
        >
          <Group gap={6} align="center" component="span" wrap="nowrap">
            <GithubMarkIcon size={16} />
            <span>GitHub</span>
          </Group>
        </Anchor>
        <Anchor
          href={YARK_DISCORD_INVITE_URL}
          target="_blank"
          rel="noreferrer"
          size="sm"
          data-settings-community-discord
        >
          <Group gap={6} align="center" component="span" wrap="nowrap">
            <DiscordMarkIcon size={16} />
            <span>Discord</span>
          </Group>
        </Anchor>
      </Group>
    </section>
  );
}
