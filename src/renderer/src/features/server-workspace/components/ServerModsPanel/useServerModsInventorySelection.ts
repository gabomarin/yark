import { useEffect, useState } from "react";

/**
 * Inventory multi-select for Server mods (#635).
 * Clears on server/view switch; prunes IDs dropped by a profile refresh.
 * Successful Remove selected clears via the caller — do not prune from local
 * optimistic `configuredIds` or a failed remove would wipe the selection.
 */
export function useServerModsInventorySelection(input: {
  serverId: string;
  view: "server" | "discover";
  /** Profile `mods` from props (not optimistic local state). */
  profileModIds: readonly string[];
}): {
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;
} {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedIds([]);
  }, [input.serverId]);

  useEffect(() => {
    setSelectedIds([]);
  }, [input.view]);

  const profileModsKey = input.profileModIds.join("\0");
  useEffect(() => {
    const nextModSet = new Set(input.profileModIds);
    setSelectedIds((previous) => {
      const pruned = previous.filter((id) => nextModSet.has(id));
      return pruned.length === previous.length ? previous : pruned;
    });
    // Content key — App polls with new array identities for the same mods.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional content key
  }, [profileModsKey]);

  return {
    selectedIds,
    setSelectedIds,
    clearSelection: () => setSelectedIds([]),
  };
}
