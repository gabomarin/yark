import type { AdminListEditAction, AdminListStateDto } from "@shared/ipc";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { ADMIN_LIST_DEFAULT_INTERVAL_SEC, ADMIN_LIST_MIN_INTERVAL_SEC } from "./adminListFormConstants";
import {
  HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT,
  notifyHostedResourcesDiagnosticsUpdated,
} from "@features/hosted-resources/hooks/useHostedResourcesHealth";
import { useHostedResourceOptions } from "@features/hosted-resources/hooks/useHostedResourceOptions";
import { isAdminListEditable, runAdminListEditMember } from "./useAdminListMembership";

function normalizeInterval(value: number | string): number {
  const raw = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(raw)) return ADMIN_LIST_DEFAULT_INTERVAL_SEC;
  return Math.max(ADMIN_LIST_MIN_INTERVAL_SEC, raw);
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export interface UseAdminsSectionArgs {
  serverId: string;
  iniDirty: boolean;
  nameById?: ReadonlyMap<string, string>;
  reloadRef?: MutableRefObject<(() => Promise<void>) | null>;
}

export function useAdminsSection(args: UseAdminsSectionArgs) {
  const { serverId, iniDirty } = args;
  const [state, setState] = useState<AdminListStateDto | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [intervalDraft, setIntervalDraft] = useState<number | string>(ADMIN_LIST_DEFAULT_INTERVAL_SEC);
  const [savedUrl, setSavedUrl] = useState("");
  const [savedInterval, setSavedInterval] = useState(ADMIN_LIST_DEFAULT_INTERVAL_SEC);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { resources, loaded } = useHostedResourceOptions();

  const applyStateToDrafts = useCallback((next: AdminListStateDto): void => {
    setState(next);
    const url = next.mode === "remote" || next.mode === "loopback" ? next.adminListUrl : "";
    setUrlDraft(url);
    setIntervalDraft(next.updateAllowedCheatersInterval);
    setSavedUrl(url);
    setSavedInterval(next.updateAllowedCheatersInterval);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    await runWithFinally(
      async () => {
        const result = await window.api.getAdminList(serverId);
        if (result.ok) {
          applyStateToDrafts(result.data);
        } else {
          setError(result.error ?? "Could not read admin whitelist");
        }
      },
      () => {
        setLoading(false);
      },
    );
  }, [serverId, applyStateToDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Refresh only the entries, leaving urlDraft/intervalDraft alone. The Survivors star edits the
   * same list and broadcasts the diagnostics event, so this tab must follow along without
   * discarding an unsaved URL/interval edit the operator is mid-way through.
   */
  const refreshEntries = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.getAdminList(serverId);
      if (result.ok) {
        setState(result.data);
      } else {
        showOperatorError(result.error ?? "Could not read admin list");
      }
    } catch (error) {
      showOperatorError(error instanceof Error ? error.message : "Could not read admin list");
    }
  }, [serverId]);

  useEffect(() => {
    const onUpdated = (): void => {
      void refreshEntries();
    };
    window.addEventListener(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT, onUpdated);
    };
  }, [refreshEntries]);

  useEffect(() => {
    if (!args.reloadRef) return;
    args.reloadRef.current = load;
    return () => {
      if (args.reloadRef) {
        args.reloadRef.current = null;
      }
    };
  }, [load, args.reloadRef]);

  useEffect(() => {
    if (!state || !args.nameById || args.nameById.size === 0) return;
    const hints: Array<{ id: string; name: string }> = [];
    for (const entry of state.entries) {
      const live = args.nameById.get(entry.id.toLowerCase())?.trim();
      if (!live) continue;
      if (entry.name?.trim() === live) continue;
      hints.push({ id: entry.id, name: live });
    }
    if (hints.length === 0) return;

    let cancelled = false;
    void (async () => {
      const result = await window.api.learnAdminListNames(serverId, hints);
      if (cancelled || !result.ok || result.data.updated === 0) return;
      setState((previous) => {
        if (!previous) return previous;
        const byId = new Map(hints.map((hint) => [hint.id.toLowerCase(), hint.name]));
        return {
          ...previous,
          entries: previous.entries.map((entry) => ({
            ...entry,
            name: byId.get(entry.id.toLowerCase()) ?? entry.name,
          })),
        };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [state, args.nameById, serverId]);

  const effectiveUrl = urlDraft.trim();

  const draftDirty = useMemo(() => {
    const interval = normalizeInterval(intervalDraft);
    if (effectiveUrl !== savedUrl) return true;
    if (interval !== savedInterval) return true;
    return false;
  }, [effectiveUrl, savedUrl, intervalDraft, savedInterval]);

  const discardDraft = (): void => {
    setUrlDraft(savedUrl);
    setIntervalDraft(savedInterval);
  };

  const validateUrl = async (): Promise<void> => {
    const url = urlDraft.trim();
    if (!isHttpUrl(url)) {
      showOperatorToast({
        title: "Validate",
        message: "Enter an http(s) URL first.",
        color: "attention",
      });
      return;
    }
    setValidating(true);
    await runWithFinally(
      async () => {
        const result = await window.api.validateAdminListUrl(serverId, url);
        if (result.ok) {
          showOperatorToast({
            title: "Admin list",
            message: `${result.data.count} id${result.data.count === 1 ? "" : "s"} found (not saved).`,
            color: "ok",
          });
        } else {
          showOperatorError(result.error ?? "Could not validate URL");
        }
      },
      () => {
        setValidating(false);
      },
    );
  };

  const saveConfig = async (): Promise<void> => {
    if (iniDirty) {
      showOperatorToast({
        title: "Admin list",
        message: "Save or discard INI Files changes first.",
        color: "attention",
        autoClose: 8000,
      });
      return;
    }
    if (!draftDirty) return;

    if (effectiveUrl.length > 0 && !isHttpUrl(effectiveUrl)) {
      showOperatorToast({
        title: "Admin list",
        message: "Use an http(s) URL, or leave the field empty.",
        color: "attention",
      });
      return;
    }

    const interval = normalizeInterval(intervalDraft);
    setSaving(true);
    await runWithFinally(
      async () => {
        const result = await window.api.setAdminList(serverId, {
          adminListUrl: effectiveUrl,
          updateAllowedCheatersInterval: interval,
        });
        if (result.ok) {
          applyStateToDrafts(result.data);
          notifyHostedResourcesDiagnosticsUpdated();
          showOperatorToast({
            title: "Admin list",
            message:
              effectiveUrl.length > 0
                ? "Saved. Restart the server once so ASA reloads the URL."
                : "AdminListURL cleared. Restart if the old list is still active.",
            color: "ok",
            autoClose: 7000,
          });
        } else {
          showOperatorError(result.error ?? "Could not save admin list");
        }
      },
      () => {
        setSaving(false);
      },
    );
  };

  const saveTooltip = iniDirty
    ? "Blocked while INI Files has unsaved changes"
    : draftDirty
      ? "Save AdminListURL"
      : "No changes to save";

  const editable = isAdminListEditable(loaded, state, resources);

  const editMember = useCallback(
    (id: string, action: AdminListEditAction, name?: string): Promise<boolean> =>
      // setState (not applyStateToDrafts): an entry edit never changes the saved URL/interval,
      // so refresh the rows and leave any unsaved panel draft untouched.
      runAdminListEditMember({ serverId, id, action, name, setBusyKey, onSuccess: setState }),
    [serverId],
  );

  return {
    state,
    urlDraft,
    intervalDraft,
    loading,
    error,
    validating,
    saving,
    draftDirty,
    saveBlockedByIni: iniDirty && draftDirty,
    saveTooltip,
    editable,
    busyKey,
    editMember,
    setUrlDraft,
    setIntervalDraft,
    discardDraft,
    load,
    validateUrl,
    saveConfig,
  };
}
