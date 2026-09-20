import { useEffect, useState, type ReactElement } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  PasswordInput,
  Popover,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { CloudArrowDown, HardDrives, Info, PencilSimple } from "@phosphor-icons/react";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import {
  DEFAULT_DISCORD_WEBHOOK_PREFERENCES,
  isDiscordWebhookUrl,
  renderDiscordMessage,
  type DiscordWebhookEvent,
  type DiscordWebhookPreferences,
} from "@shared/settings/discord-webhook";
import {
  DISCORD_SERVER_EVENTS,
  DISCORD_STEAMCMD_EVENTS,
  discordPreviewContext,
  type DiscordEventOption,
} from "../model/discordSettingsModel";
import classes from "../SettingsPage.module.css";

export function SettingsDiscordSection(): ReactElement {
  const [draft, setDraft] = useState<DiscordWebhookPreferences>(DEFAULT_DISCORD_WEBHOOK_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState<{ color: "red" | "ok"; text: string } | null>(null);
  const [focusedEvent, setFocusedEvent] = useState<DiscordWebhookEvent>("serverStarted");
  const [editingEvent, setEditingEvent] = useState<DiscordWebhookEvent | null>(null);
  const [lastTestPassed, setLastTestPassed] = useState(false);

  useEffect(() => {
    let active = true;
    void window.api.getDiscordWebhook().then((result) => {
      if (!active) return;
      if (result.ok) setDraft(result.data);
      else setMessage({ color: "red", text: result.error });
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const validUrl = isDiscordWebhookUrl(draft.webhookUrl);
  const persist = async (next: DiscordWebhookPreferences): Promise<void> => {
    setBusy("save");
    setMessage(null);
    const result = await window.api.setDiscordWebhook(next);
    setBusy(null);
    if (!result.ok) {
      setMessage({ color: "red", text: result.error });
      return;
    }
    setDraft(result.data);
  };

  const setEvent = (event: DiscordWebhookEvent, enabled: boolean): void => {
    const next = {
      ...draft,
      events: { ...draft.events, [event]: enabled },
    };
    setDraft(next);
    void persist(next);
    setMessage(null);
  };

  const setEnabled = (enabled: boolean): void => {
    const next = { ...draft, enabled };
    setDraft(next);
    void persist(next);
    setMessage(null);
  };

  /* URL changes are persisted on blur so typing a token does not issue one request per key. */
  const persistUrl = (): void => {
    if (draft.webhookUrl.length > 0 && !isDiscordWebhookUrl(draft.webhookUrl)) return;
    void persist(draft);
  };

  const setCustomMessage = (event: DiscordWebhookEvent, value: string): void => {
    setDraft((current) => ({
      ...current,
      customMessages: { ...current.customMessages, [event]: value },
    }));
    setMessage(null);
  };

  /* Message templates are persisted on blur for the same reason as the URL. */
  const persistCustomMessage = (): void => {
    void persist(draft);
  };

  const test = async (): Promise<void> => {
    setBusy("test");
    setMessage(null);
    const template = draft.customMessages[focusedEvent];
    const option = [...DISCORD_SERVER_EVENTS, ...DISCORD_STEAMCMD_EVENTS].find(
      (candidate) => candidate.id === focusedEvent,
    );
    const description =
      template !== undefined && template.trim().length > 0 && option !== undefined
        ? renderDiscordMessage(template, discordPreviewContext(option.usesDetail))
        : undefined;
    const result = await window.api.testDiscordWebhook(draft.webhookUrl, description);
    setBusy(null);
    setLastTestPassed(result.ok);
    setMessage(result.ok ? { color: "ok", text: "Test notification sent." } : { color: "red", text: result.error });
  };

  const renderEventField = (option: DiscordEventOption): ReactElement => {
    const template = draft.customMessages[option.id] ?? "";
    const preview =
      template.trim().length > 0 ? renderDiscordMessage(template, discordPreviewContext(option.usesDetail)) : null;
    const isEditing = editingEvent === option.id;
    return (
      <div key={option.id} className={classes.discordEventRow}>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" className={classes.discordEventIdentity}>
            <Checkbox
              checked={draft.events[option.id]}
              disabled={!ready || !draft.enabled || busy !== null}
              label={option.label}
              onChange={(event) => setEvent(option.id, event.currentTarget.checked)}
            />
            <Popover width={280} position="top" withArrow shadow="md">
              <Popover.Target>
                <ActionIcon variant="subtle" color="gray" size="xs" aria-label={`About ${option.label}`}>
                  <Info size={13} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Text size="xs">{option.description}</Text>
              </Popover.Dropdown>
            </Popover>
          </Group>
          <Group gap={4} wrap="nowrap">
            {template.trim().length > 0 && <Badge variant="light">Customized</Badge>}
            <ActionIcon
              variant={isEditing ? "light" : "subtle"}
              size="sm"
              disabled={!ready || !draft.enabled}
              aria-label={`Customize message for ${option.label}`}
              onClick={() => {
                setFocusedEvent(option.id);
                setEditingEvent(isEditing ? null : option.id);
              }}
            >
              <PencilSimple size={15} />
            </ActionIcon>
          </Group>
        </Group>
        <Collapse expanded={isEditing}>
          <div className={classes.discordEventEditor}>
            <TextInput
              aria-label={`Custom message for ${option.label}`}
              placeholder="Use the default message"
              value={template}
              disabled={!ready || !draft.enabled || busy === "save"}
              onChange={(event) => setCustomMessage(option.id, event.currentTarget.value)}
              onFocus={() => setFocusedEvent(option.id)}
              onBlur={persistCustomMessage}
            />
            {preview !== null && (
              <Text size="xs" c="dimmed" mt={4}>
                Preview: {preview}
              </Text>
            )}
            {!option.usesDetail && template.includes("{detail}") && (
              <Text size="xs" c="attention" mt={4}>
                {`\`{detail}\``} works only in SteamCMD events; it won't be filled in here.
              </Text>
            )}
          </div>
        </Collapse>
      </div>
    );
  };

  const connectionStatus = lastTestPassed
    ? { label: "Test passed", color: "ok" }
    : draft.webhookUrl.length === 0
      ? { label: "Not configured", color: "gray" }
      : !validUrl
        ? { label: "Check URL", color: "red" }
        : draft.enabled
          ? { label: "Ready", color: "blue" }
          : { label: "Disabled", color: "gray" };

  return (
    <section className={classes.section} aria-labelledby="settings-discord">
      <div>
        <Title order={3} size="h4" id="settings-discord">
          Discord
        </Title>
        <Text size="xs" c="dimmed" mt={2}>
          Fleet alerts to one Discord webhook while YARK is running.
        </Text>
      </div>

      <AppSurfaceCard tone="flat" padding="sm" radius={0} className={classes.discordConnectionCard}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text size="sm" fw={600}>
              Connection
            </Text>
            <Text size="xs" c="dimmed" mt={2}>
              Enable alerts and choose the Discord channel that receives them.
            </Text>
          </div>
          <Group gap="xs" wrap="nowrap">
            <Badge variant="light" color={connectionStatus.color}>
              {connectionStatus.label}
            </Badge>
            <Switch
              checked={draft.enabled}
              disabled={!ready || busy !== null}
              aria-label="Discord alerts"
              onChange={(event) => setEnabled(event.currentTarget.checked)}
            />
          </Group>
        </Group>

        <Group align="flex-end" gap="sm" mt="sm" wrap="nowrap" className={classes.discordConnectionFields}>
          <PasswordInput
            className={classes.discordWebhookField}
            label="Webhook URL"
            placeholder="https://discord.com/api/webhooks/..."
            value={draft.webhookUrl}
            disabled={!ready || busy === "save"}
            error={draft.webhookUrl.length > 0 && !validUrl ? "Enter a valid discord.com webhook URL." : undefined}
            onChange={(event) => {
              const webhookUrl = event.currentTarget.value;
              setDraft((current) => ({ ...current, webhookUrl }));
              setLastTestPassed(false);
              setMessage(null);
            }}
            onBlur={persistUrl}
          />
          <Button
            variant="default"
            disabled={!ready || !validUrl || busy !== null}
            loading={busy === "test"}
            title="Posts the focused field's template, or the built-in copy when the field is empty"
            onClick={() => void test()}
          >
            Send test
          </Button>
        </Group>

        {message !== null && (
          <AppAlert color={message.color} mt="sm">
            {message.text}
          </AppAlert>
        )}
      </AppSurfaceCard>

      <Group justify="space-between" align="flex-end" gap="sm">
        <div>
          <Text size="sm" fw={600}>
            Notifications
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Choose events to send. Personalize a message only when you need to.
          </Text>
        </div>
        <Popover width={360} position="bottom-end" withArrow shadow="md">
          <Popover.Target>
            <Button variant="subtle" leftSection={<Info size={14} />}>
              Message variables
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Text size="xs">
                <Text component="span" fw={600}>{`{server}`}</Text> inserts the server name. Example:{" "}
                {`{server} crashed`} → Island crashed.
              </Text>
              <Text size="xs">
                <Text component="span" fw={600}>{`{detail}`}</Text> inserts SteamCMD job detail and works only for
                SteamCMD events.
              </Text>
              <Text size="xs" c="dimmed">
                Discord formatting works: **bold**, *italics*, __underline__, ~~strikethrough~~, and `code`. Mentions
                stay off.
              </Text>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" data-discord-events-grid>
        <AppSurfaceCard
          tone="flat"
          padding={0}
          radius={0}
          className={classes.discordEventCard}
          data-discord-server-events
        >
          <Group gap="xs" className={classes.discordEventCardHeader}>
            <HardDrives size={17} />
            <Text size="sm" fw={600}>
              Server events
            </Text>
          </Group>
          <div>{DISCORD_SERVER_EVENTS.map(renderEventField)}</div>
        </AppSurfaceCard>
        <AppSurfaceCard
          tone="flat"
          padding={0}
          radius={0}
          className={classes.discordEventCard}
          data-discord-steamcmd-jobs
        >
          <Group gap="xs" className={classes.discordEventCardHeader}>
            <CloudArrowDown size={17} />
            <Text size="sm" fw={600}>
              SteamCMD jobs
            </Text>
          </Group>
          <div>{DISCORD_STEAMCMD_EVENTS.map(renderEventField)}</div>
        </AppSurfaceCard>
      </SimpleGrid>

      <Group gap="xs" wrap="nowrap" className={classes.discordPrivacyNote}>
        <Info size={14} />
        <Text size="xs" c="dimmed">
          Changes save automatically. Discord receives alerts only and cannot control your servers. Delete the webhook
          in Discord if its URL leaks.
        </Text>
      </Group>
    </section>
  );
}
