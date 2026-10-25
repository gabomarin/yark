import { Button, Group, List, Text } from "@mantine/core";
import type { ServerProfile } from "@shared/types";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { importChoiceIdentity, planAdoptExternalIni, serverToProfileInput } from "@shared/ini/ini-import-adopt";
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
  /** This profile identity was just chosen. A form remount must not read the file again. */
  choiceSettled?: boolean;
  onChoiceSettled?: (identity: string) => void;
  onUpdated?: () => void;
}): ReactElement | null {
  const { server, servers, profileDirty = false, choiceSettled = false, onChoiceSettled, onUpdated } = props;
  const [report, setReport] = useState<IniImportCompatibilityReport | null>(null);
  const [pending, setPending] = useState<"file" | "yark" | null>(null);
  const pendingRef = useRef<"file" | "yark" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Hide after a choice. Profile save writes the INI without waiting, so a re-read can still see the old file. */
  const [resolved, setResolved] = useState(choiceSettled);

  useEffect(() => {
    if (choiceSettled) {
      setResolved(true);
      return;
    }
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
    choiceSettled,
  ]);

  if (resolved || report === null || report.replacements.length === 0) return null;
  const kept = formatIniImportKeptSummary(report);

  const apply = async (input: ReturnType<typeof serverToProfileInput>, which: "file" | "yark"): Promise<void> => {
    if (pendingRef.current !== null) return;
    pendingRef.current = which;
    setPending(which);
    setActionError(null);
    try {
      const result = await window.api.updateServer(server.id, input);
      if (!result.ok) {
        setActionError(result.error ?? "Could not update the server");
        return;
      }
      onChoiceSettled?.(importChoiceIdentity(server.id, input));
      setResolved(true);
      onUpdated?.();
    } catch {
      setActionError("Could not update the server");
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
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
    void apply(plan.input, "file");
  };

  const discard = (): void => {
    if (profileDirty) {
      setActionError("Save or cancel the edits on this form first.");
      return;
    }
    void apply(serverToProfileInput(server), "yark");
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
              .map((line, index) => (
                <Text key={`${field.id}-${index}`} size="sm">
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
          loading={pending === "file"}
          disabled={pending !== null || profileDirty}
          title={profileDirty ? "Save or cancel the edits on this form first." : undefined}
          onClick={updateYark}
        >
          Use file values
        </Button>
        <Button
          size="xs"
          variant="default"
          loading={pending === "yark"}
          disabled={pending !== null || profileDirty}
          title={profileDirty ? "Save or cancel the edits on this form first." : undefined}
          onClick={discard}
        >
          Keep YARK values
        </Button>
      </Group>
    </AppAlert>
  );
}
