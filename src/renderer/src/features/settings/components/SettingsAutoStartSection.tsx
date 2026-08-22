import type { ReactElement } from "react";
import { Play } from "@phosphor-icons/react";
import { Badge, Button, Group, Stack, Text, Title } from "@mantine/core";
import { isInstallationReady } from "@shared/installation-health";
import type { ServerInstallationInfo, ServerProfile } from "@shared/types";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import classes from "../SettingsPage.module.css";

type AutoStartSummaryState = "armed" | "ignored" | "blocked";

interface AutoStartSummaryRow {
  server: ServerProfile;
  state: AutoStartSummaryState;
  detail: string;
}

interface Props {
  servers: ServerProfile[];
  installationInfo: Map<string, ServerInstallationInfo>;
  onOpenServer: (serverId: string) => void;
}

function buildAutoStartSummaryRows(
  servers: ServerProfile[],
  installationInfo: Map<string, ServerInstallationInfo>,
): AutoStartSummaryRow[] {
  return servers
    .filter((server) => server.autoStart)
    .map((server) => {
      if (!server.enabled) {
        return {
          server,
          state: "ignored" as const,
          detail: "Inactive – preference kept",
        };
      }
      const installation = installationInfo.get(server.id) ?? null;
      if (!isInstallationReady(installation)) {
        return {
          server,
          state: "blocked" as const,
          detail: installation?.guidance ?? "Install not ready",
        };
      }
      return {
        server,
        state: "armed" as const,
        detail: "Will start on next YARK launch",
      };
    })
    .sort((a, b) => a.server.name.localeCompare(b.server.name));
}

function stateBadge(state: AutoStartSummaryState): ReactElement {
  if (state === "armed") {
    return (
      <Badge size="sm" color="teal" variant="light">
        Will start
      </Badge>
    );
  }
  if (state === "ignored") {
    return (
      <Badge size="sm" color="gray" variant="light">
        Ignored (inactive)
      </Badge>
    );
  }
  return (
    <Badge size="sm" color="yellow" variant="light">
      Blocked
    </Badge>
  );
}

export function SettingsAutoStartSection(props: Props): ReactElement {
  const rows = buildAutoStartSummaryRows(props.servers, props.installationInfo);

  return (
    <section className={classes.section} aria-labelledby="settings-auto-start">
      <Title order={3} size="h4" id="settings-auto-start">
        Server auto-start
      </Title>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Play size={22} />}
          title="No servers opted in"
          description="Open a server → Server tab → Auto-start with YARK."
        />
      ) : (
        <Stack gap="sm" className={classes.autoStartList}>
          {rows.map((row) => (
            <Group
              key={row.server.id}
              justify="space-between"
              align="flex-start"
              wrap="wrap"
              gap="sm"
              className={classes.autoStartRow}
            >
              <div className={classes.autoStartCopy}>
                <Group gap="xs" wrap="wrap">
                  <Text size="sm" fw={600}>
                    {row.server.name}
                  </Text>
                  {stateBadge(row.state)}
                </Group>
                <Text size="xs" c="dimmed">
                  {row.server.map} · {row.detail}
                </Text>
              </div>
              <Button
                size="xs"
                variant="light"
                onClick={() => props.onOpenServer(row.server.id)}
              >
                Open server
              </Button>
            </Group>
          ))}
        </Stack>
      )}
    </section>
  );
}
