import type { ReactElement } from "react";
import { Button, CloseButton, Group, Text } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { YARK_DISCORD_INVITE_URL } from "@shared/yark-community";
import { DISCORD_INVITE_DISMISSED_STORAGE_KEY } from "../../model/discordInviteModel";
import { AccentIconTile } from "@ui/AccentIconTile/AccentIconTile";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import { DiscordMarkIcon } from "@ui/BrandMarkIcons/BrandMarkIcons";
import classes from "./DiscordInviteCard.module.css";

/**
 * One-time community CTA on Overview (in-flow bottom-right).
 * Deliberately NOT the operator toast channel — toasts report completed/failed
 * operator actions; this is a dismissible promo that persists across launches.
 */
export function DiscordInviteCard(): ReactElement | null {
  const [dismissed, setDismissed] = useLocalStorage({
    key: DISCORD_INVITE_DISMISSED_STORAGE_KEY,
    defaultValue: false,
    getInitialValueInEffect: false,
  });
  if (dismissed) return null;
  return (
    <aside
      className={classes.positioner}
      aria-labelledby="discord-invite-title"
      data-discord-invite-card
    >
      <AppSurfaceCard tone="cool" radius={0} className={classes.card} padding="sm">
        <div className={classes.layout}>
          <Group gap="sm" wrap="nowrap" align="center" className={classes.identity}>
            <AccentIconTile shape="rounded" size="sm" tone="accent">
              <DiscordMarkIcon size={18} />
            </AccentIconTile>
            <div className={classes.copy}>
              <Text id="discord-invite-title" size="sm" fw={600} truncate>
                Join the YARK Discord
              </Text>
              <Text size="xs" c="dimmed">
                Get help, share ARK server tips, and stay up to date.
              </Text>
            </div>
          </Group>
          <Group gap="xs" wrap="nowrap" className={classes.actions}>
            <Button
              component="a"
              href={YARK_DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              variant="filled"
              onClick={() => setDismissed(true)}
              data-discord-invite-join
            >
              Open Discord
            </Button>
            <CloseButton
              size="sm"
              aria-label="Dismiss Discord invite"
              onClick={() => setDismissed(true)}
              data-discord-invite-dismiss
            />
          </Group>
        </div>
      </AppSurfaceCard>
    </aside>
  );
}
