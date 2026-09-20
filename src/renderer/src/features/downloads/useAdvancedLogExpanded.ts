import { useLayoutEffect, useState } from "react";
import { useLocalStorage } from "@mantine/hooks";
import { advancedLogAttentionIds, shouldAutoExpandAdvancedLog, type DownloadRow } from "./downloadsModel";

export const ADVANCED_LOG_STORAGE_KEY = "yark.downloads.advancedLog.expanded.v1";
export const ADVANCED_LOG_SEEN_IDS_KEY = "yark.downloads.advancedLog.autoOpenedIds.v1";

function readSeenAdvancedLogAttentionIds(): string[] {
  try {
    const raw = sessionStorage.getItem(ADVANCED_LOG_SEEN_IDS_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function rememberAdvancedLogAttentionIds(ids: readonly string[]): void {
  const merged = new Set(readSeenAdvancedLogAttentionIds());
  for (const id of ids) {
    if (id.length > 0) {
      merged.add(id);
    }
  }
  sessionStorage.setItem(ADVANCED_LOG_SEEN_IDS_KEY, JSON.stringify([...merged]));
}

export function useAdvancedLogExpanded(rows: readonly DownloadRow[]): {
  logExpanded: boolean;
  toggleLogExpanded: () => void;
} {
  const [operatorExpanded, setOperatorExpanded] = useLocalStorage({
    key: ADVANCED_LOG_STORAGE_KEY,
    defaultValue: false,
    getInitialValueInEffect: false,
  });
  const [attentionHold, setAttentionHold] = useState(() =>
    shouldAutoExpandAdvancedLog(rows, readSeenAdvancedLogAttentionIds()),
  );

  useLayoutEffect(() => {
    if (!shouldAutoExpandAdvancedLog(rows, readSeenAdvancedLogAttentionIds())) {
      return;
    }
    setAttentionHold(true);
    rememberAdvancedLogAttentionIds(advancedLogAttentionIds(rows));
  }, [rows]);

  const logExpanded = operatorExpanded || attentionHold;
  const toggleLogExpanded = (): void => {
    if (logExpanded) {
      setOperatorExpanded(false);
      setAttentionHold(false);
      rememberAdvancedLogAttentionIds(advancedLogAttentionIds(rows));
      return;
    }
    setOperatorExpanded(true);
  };

  return { logExpanded, toggleLogExpanded };
}
