import { useCallback, useState } from "react";
import type { HostedResourceConsumer } from "@shared/settings/hosted-resource-consumers";
import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import type { HostedResourceEditorDraft } from "./useHostedResourcesPage";

interface HostedResourceQuickCreate {
  draft: HostedResourceEditorDraft | null;
  busy: boolean;
  open: () => void;
  close: () => void;
  update: (patch: Partial<HostedResourceEditorDraft>) => void;
  submit: () => void;
}

/**
 * Create-and-assign flow for a setting selector (#577): the create modal is pre-filled
 * with the consumer's kind/format and the URL is handed back to the field on success.
 * The field's own Save still owns persistence, so nothing is written behind the operator.
 */
export function useHostedResourceQuickCreate(
  consumer: HostedResourceConsumer,
  onCreated: (url: string) => void,
): HostedResourceQuickCreate {
  const [draft, setDraft] = useState<HostedResourceEditorDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const open = useCallback(() => {
    setDraft({
      mode: "create",
      resourceId: null,
      displayName: consumer.setting,
      format: consumer.format,
      kind: consumer.kind,
      content: "",
      notes: "",
      tagsText: "",
    });
  }, [consumer.format, consumer.kind, consumer.setting]);

  const close = useCallback(() => setDraft(null), []);

  const update = useCallback((patch: Partial<HostedResourceEditorDraft>) => {
    setDraft((previous) => (previous === null ? previous : { ...previous, ...patch }));
  }, []);

  const submit = useCallback(() => {
    if (draft === null) return;
    const displayName = draft.displayName.trim();
    if (displayName.length === 0) {
      showOperatorError("Display name is required.");
      return;
    }
    if (draft.content.trim().length === 0) {
      showOperatorError("Add the content before saving.");
      return;
    }
    const tags = draft.tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    setBusy(true);
    void runWithFinally(
      async () => {
        try {
          const result = await window.api.createHostedResource({
            displayName,
            format: draft.format,
            content: draft.content,
            notes: draft.notes,
            tags,
            kind: draft.kind,
          });
          if (!result.ok) {
            showOperatorError(result.error, "Could not create the resource");
            return;
          }
          onCreated(result.data.url);
          showOperatorToast({
            title: "Resource published",
            message: "The URL is now assigned to this field. Save to keep it.",
          });
          setDraft(null);
        } catch (error) {
          showOperatorError(error instanceof Error ? error.message : "Could not create the resource");
        }
      },
      () => setBusy(false),
    );
  }, [draft, onCreated]);

  return { draft, busy, open, close, update, submit };
}
