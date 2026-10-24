import { Button, Group, List, Text } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import { useEffect, useState, type ReactElement } from "react";
import { planAdoptExternalIni, serverToProfileInput } from "@shared/ini/ini-import-adopt";
import {
  buildIniImportCompatibilityReport,
  formatIniImportKeptSummary,
  formatIniImportReplacement,
  type IniImportCompatibilityReport,
} from "@shared/ini/ini-import-compatibility";
import { AppAlert } from "@ui/AppAlert/AppAlert";

/**
 * Asks whether to keep values that look edited outside YARK, or discard them.
 * Adopting the INI checks port clashes with other servers. Does not block Start (#682).
 */
export function ImportCompatibilityReport(props: {
  server: ServerProfile;
  servers: ServerProfile[];
  profileDirty?: boolean;
  onUpdated?: () => void;
}): ReactElement | null {
  const { server, servers, profileDirty = false, onUpdated } = props;
  const [report, setReport] = useState<IniImportCompatibilityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Hide after a choice. Profile save writes the INI without waiting, so a re-read can still see the old file. */
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setActionError(null);
    setResolved(false);
    void window.api
      .readServerIni(server.id)
      .then((result) => {
        if (cancelled || !result.ok) return;
        setReport(
          buildIniImportCompatibilityReport(
            {
              sessionName: server.sessionName,
              gamePort: server.gamePort,
              queryPort: server.queryPort,
              rconPort: server.rconPort,
              adminPassword: server.adminPassword,
              serverPassword: server.serverPassword,
            },
            result.data.payload,
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    server.id,
    server.sessionName,
    server.gamePort,
    server.queryPort,
    server.rconPort,
    server.adminPassword,
    server.serverPassword,
  ]);

  if (resolved || report === null || report.replacements.length === 0) return null;
  const kept = formatIniImportKeptSummary(report);

  const apply = async (input: ReturnType<typeof serverToProfileInput>): Promise<void> => {
    setBusy(true);
    setActionError(null);
    const result = await window.api.updateServer(server.id, input);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error ?? "Could not update the server");
      return;
    }
    onUpdated?.();
    setResolved(true);
  };

  const updateYark = (): void => {
    if (profileDirty) {
      setActionError("Save or cancel the edits on this form first.");
      return;
    }
    const plan = planAdoptExternalIni(server, servers, report);
    if (!plan.ok) {
      setActionError(plan.reason);
      return;
    }
    void apply(plan.input);
  };

  const discard = (): void => {
    if (profileDirty) {
      setActionError("Save or cancel the edits on this form first.");
      return;
    }
    void apply(serverToProfileInput(server));
  };

  return (
    <AppAlert color="blue" title="Choose which values to keep" data-import-compatibility-report>
      <Text size="sm">
        GameUserSettings.ini has values that differ from this server&apos;s settings in YARK. Choose which values to
        keep:
      </Text>
      <List size="sm" mt="xs">
        {report.replacements.map((field) => (
          <List.Item key={field.id}>
            {formatIniImportReplacement(field)
              .split("\n")
              .map((line) => (
                <Text key={line} size="sm">
                  {line}
                </Text>
              ))}
          </List.Item>
        ))}
      </List>
      {kept !== null ? (
        <Text size="sm" mt="xs">
          {kept}
        </Text>
      ) : null}
      {actionError !== null ? (
        <Text size="sm" c="red" mt="xs">
          {actionError}
        </Text>
      ) : null}
      <Group gap="xs" mt="sm">
        <Button
          size="xs"
          loading={busy}
          disabled={profileDirty}
          title={profileDirty ? "Save or cancel the edits on this form first." : undefined}
          onClick={updateYark}
        >
          Use file values
        </Button>
        <Button
          size="xs"
          variant="default"
          loading={busy}
          disabled={profileDirty}
          title={profileDirty ? "Save or cancel the edits on this form first." : undefined}
          onClick={discard}
        >
          Keep YARK values
        </Button>
      </Group>
    </AppAlert>
  );
}
