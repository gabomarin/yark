import { notifications } from "@mantine/notifications";
import { showOperatorToast } from "@ui/operatorToast";

const MOD_ADDED_TOAST_LIMIT = 2;

/** Cap concurrent "Mod Added" toasts. Module-level so URL + Discover share one queue. */
const visibleIds: string[] = [];
let toastSeq = 0;

/** Test helper — do not use in product code. */
export function resetModAddedToastQueue(): void {
  visibleIds.length = 0;
  toastSeq = 0;
}

const viteHot = (
  import.meta as ImportMeta & { hot?: { dispose: (cb: () => void) => void } }
).hot;
if (viteHot !== undefined) {
  viteHot.dispose(() => {
    for (const id of [...visibleIds]) notifications.hide(id);
    resetModAddedToastQueue();
  });
}

/** Toast after Add so operators see that new Project IDs are not on Start yet (#226). */
export function notifyModsAddedDisabled(input: { name?: string } = {}): void {
  while (visibleIds.length >= MOD_ADDED_TOAST_LIMIT) {
    const oldest = visibleIds.shift();
    if (oldest !== undefined) notifications.hide(oldest);
  }
  const id = `mods-added-${++toastSeq}`;
  visibleIds.push(id);
  showOperatorToast({
    id,
    title: "Mod Added",
    message: `${input.name ?? "This Project ID"} is on the list but will not load until you enable it.`,
    color: "yellow",
    onClose: () => {
      const index = visibleIds.indexOf(id);
      if (index >= 0) visibleIds.splice(index, 1);
    },
  });
}

export function notifyNewlyAddedMods(
  previousIds: string[],
  next: { configuredIds: string[]; cache: Record<string, { name?: string }> },
): void {
  const previous = new Set(previousIds);
  for (const id of next.configuredIds) {
    if (previous.has(id)) continue;
    notifyModsAddedDisabled({ name: next.cache[id]?.name });
  }
}
