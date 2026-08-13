import { Alert, Button, Group, Stack } from "@mantine/core";
import { modals } from "@mantine/modals";
import type { WorkspaceLeaveCopy } from "./workspaceLeaveGuard";

/**
 * Unsaved-leave confirm: fossil alert, Keep editing / Discard / optional Save (#299).
 */
export function openUnsavedLeaveModal(input: {
  copy: Extract<WorkspaceLeaveCopy, { kind: "confirm" }>;
  onDiscard: () => void;
  /** Return false to keep the modal open (save failed). */
  onSave?: () => boolean | Promise<boolean>;
}): void {
  const id = modals.open({
    title: input.copy.title,
    children: (
      <Stack gap="md">
        <Alert color="fossil" title={input.copy.alertTitle} variant="light">
          {input.copy.message}
        </Alert>
        <Group justify="flex-end" gap="xs" wrap="wrap">
          <Button variant="default" onClick={() => modals.close(id)}>
            Keep editing
          </Button>
          <Button
            color="fossil"
            variant="light"
            onClick={() => {
              modals.close(id);
              input.onDiscard();
            }}
          >
            Discard and continue
          </Button>
          {input.onSave !== undefined && (
            <Button
              color="fossil"
              onClick={() => {
                void (async () => {
                  const ok = await input.onSave?.();
                  if (ok !== false) {
                    modals.close(id);
                  }
                })();
              }}
            >
              Save and continue
            </Button>
          )}
        </Group>
      </Stack>
    ),
  });
}
