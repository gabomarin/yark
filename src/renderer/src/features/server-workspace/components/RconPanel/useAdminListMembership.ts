import type { AdminListEditAction, AdminListStateDto } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import {
  HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT,
  notifyHostedResourcesDiagnosticsUpdated,
} from "@features/hosted-resources/hooks/useHostedResourcesHealth";
import { useHostedResourceOptions } from "@features/hosted-resources/hooks/useHostedResourceOptions";
import { classifyHostedResourceValue } from "@features/hosted-resources/model/hostedResourceAssignment";
import { ADMIN_LIST_URL_CONSUMER } from "@shared/settings/hosted-resource-consumers";
import type { HostedResourceLike } from "@shared/settings/hosted-resource-consumers";

/**
 * Local add/remove of ids on a hosted AdminList resource (#565). True only when the active
 * AdminListURL is a loopback URL served by a current, compatible, published YARK resource.
 * Third-party remote lists and broken resources stay read-only.
 */
export function isAdminListEditable(
  loaded: boolean,
  state: AdminListStateDto | null,
  resources: readonly HostedResourceLike[],
): boolean {
  if (!loaded || state === null || state.mode !== "loopback") return false;
  const assignment = classifyHostedResourceValue(state.adminListUrl, resources, ADMIN_LIST_URL_CONSUMER);
  return assignment.resource !== null && assignment.issue === null;
}

interface AdminListMembership {
  state: AdminListStateDto | null;
  editable: boolean;
  busyKey: string | null;
  isMember: (id: string) => boolean;
  reload: () => Promise<void>;
  editMember: (id: string, action: AdminListEditAction, name?: string) => Promise<boolean>;
}

/**
 * The one add/remove flow shared by the Admins tab and the Survivors star, so the busy flag,
 * toast copy and diagnostics broadcast cannot drift between two copies. Resolves true when the
 * backend applied the edit, false when it reported an error (already surfaced as a toast).
 */
export async function runAdminListEditMember(input: {
  serverId: string;
  id: string;
  action: AdminListEditAction;
  name?: string;
  setBusyKey: (key: string | null) => void;
  onSuccess: (state: AdminListStateDto) => void;
}): Promise<boolean> {
  const { serverId, id, action, name, setBusyKey, onSuccess } = input;
  setBusyKey(id);
  return runWithFinally(
    async () => {
      const result = await window.api.editAdminListMember(serverId, id, action, name);
      if (!result.ok) {
        showOperatorError(result.error ?? `Could not ${action} admin id`);
        return false;
      }
      onSuccess(result.data);
      notifyHostedResourcesDiagnosticsUpdated();
      showOperatorToast({
        title: "Admin list",
        message: `Saved. ASA re-checks this list every ${result.data.updateAllowedCheatersInterval}s — no restart needed.`,
        color: "ok",
        autoClose: 6000,
      });
      return true;
    },
    () => {
      setBusyKey(null);
    },
  );
}

/** Survivors star toggling for the AdminList hosted resource behind the loopback URL (#565). */
export function useAdminListMembership(serverId: string): AdminListMembership {
  const [state, setState] = useState<AdminListStateDto | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { resources, loaded } = useHostedResourceOptions();

  const reload = useCallback(async (): Promise<void> => {
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
    void reload();
  }, [reload]);

  // The Admins tab edits this same list; reload so a removal there clears this star too.
  useEffect(() => {
    const onUpdated = (): void => {
      void reload();
    };
    window.addEventListener(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(HOSTED_RESOURCES_DIAGNOSTICS_UPDATED_EVENT, onUpdated);
    };
  }, [reload]);

  const editable = isAdminListEditable(loaded, state, resources);

  const isMember = useCallback(
    (id: string): boolean =>
      editable ? (state?.entries.some((entry) => entry.id.toLowerCase() === id.toLowerCase()) ?? false) : false,
    [editable, state],
  );

  const editMember = useCallback(
    (id: string, action: AdminListEditAction, name?: string): Promise<boolean> =>
      runAdminListEditMember({ serverId, id, action, name, setBusyKey, onSuccess: setState }),
    [serverId],
  );

  return { state, editable, busyKey, isMember, reload, editMember };
}
