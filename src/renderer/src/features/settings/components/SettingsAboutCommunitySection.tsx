import type { ReactElement } from "react";
import { Button, Group, Text, Title } from "@mantine/core";
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
      <Group gap="sm" align="center" mt="xs">
        <Button
          component="a"
          href={YARK_GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          size="sm"
          variant="default"
          color="gray"
          leftSection={<GithubMarkIcon size={16} />}
          data-settings-community-github
        >
          GitHub
        </Button>
        <Button
          component="a"
          href={YARK_DISCORD_INVITE_URL}
          target="_blank"
          rel="noreferrer"
          size="sm"
          variant="default"
          color="gray"
          leftSection={<DiscordMarkIcon size={16} />}
          data-settings-community-discord
        >
          Discord
        </Button>
      </Group>
    </section>
  );
}
