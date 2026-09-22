import type { ReactElement } from "react";
import { Button, Group, Select, Stack, TagsInput, Text, Textarea, TextInput } from "@mantine/core";
import {
  formatForHostedResourceKind,
  HOSTED_RESOURCE_KIND_LABELS,
  HOSTED_RESOURCE_KINDS,
  HOSTED_RESOURCES_MAX_CONTENT_BYTES,
  HOSTED_RESOURCES_MAX_DISPLAY_NAME_LENGTH,
  HOSTED_RESOURCES_MAX_NOTES_LENGTH,
  HOSTED_RESOURCES_MAX_TAGS,
  HOSTED_RESOURCE_TAG_OPTIONS,
  isHostedResourceKind,
  kindsForHostedResourceFormat,
  type HostedResourceKind,
} from "@shared/settings/hosted-resources";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import {
  contentByteLength,
  contentPlaceholder,
  formatByteSize,
  formatLabel,
  HOSTED_RESOURCE_FORMAT_OPTIONS,
} from "../../model/hostedResourcesPageModel";
import type { HostedResourceEditorDraft } from "../../hooks/useHostedResourcesPage";

interface Props {
  draft: HostedResourceEditorDraft | null;
  busy: boolean;
  onChange: (patch: Partial<HostedResourceEditorDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function HostedResourceEditorModal(props: Props): ReactElement {
  const draft = props.draft;
  const isCreate = draft?.mode === "create";
  const contentBytes = draft === null ? 0 : contentByteLength(draft.content);
  const overLimit = contentBytes > HOSTED_RESOURCES_MAX_CONTENT_BYTES;
  // The type drives the format while creating, so every kind is pickable there. Once the
  // resource exists its format is immovable, so kinds that need another format are listed
  // but disabled: hiding them reads as a missing option instead of a locked one.
  const allowedKinds =
    draft === null || isCreate ? [...HOSTED_RESOURCE_KINDS] : kindsForHostedResourceFormat(draft.format);
  const kindOptions = HOSTED_RESOURCE_KINDS.map((kind) => ({
    value: kind,
    label: HOSTED_RESOURCE_KIND_LABELS[kind],
    disabled: !allowedKinds.includes(kind),
  }));
  const changeKind = (value: string | null): void => {
    if (draft === null) return;
    const kind: HostedResourceKind | null = isHostedResourceKind(value) ? value : null;
    props.onChange({ kind, format: kind === null ? draft.format : formatForHostedResourceKind(kind) });
  };
  return (
    <AppPanelModal
      opened={draft !== null}
      onClose={props.onClose}
      title={isCreate ? "Create hosted resource" : `Edit hosted resource · ${draft?.displayName ?? ""}`}
      meta={isCreate ? "Create a local URL for ASA to fetch" : "Update this resource's content and details"}
      size={672}
    >
      {draft !== null && (
        <Stack gap="sm">
          <TextInput
            label="Display name"
            placeholder="Admins allowlist"
            description="The name shown for this resource in YARK; it is not part of the URL."
            value={draft.displayName}
            onChange={(event) => props.onChange({ displayName: event.currentTarget.value })}
            maxLength={HOSTED_RESOURCES_MAX_DISPLAY_NAME_LENGTH}
            required
            data-hosted-resource-name
          />
          <Select
            label="Type"
            description={
              isCreate
                ? "Choose the ASA setting this resource is for. Matching fields will offer it automatically; leave blank to use it manually."
                : "This determines which ASA setting can use the resource. Types that need another format are unavailable."
            }
            placeholder="No type — use manually"
            data={kindOptions}
            value={draft.kind}
            onChange={changeKind}
            clearable
            allowDeselect
            data-hosted-resource-kind
          />
          {isCreate ? (
            <>
              <Select
                label="Format"
                description={
                  draft.kind === null
                    ? `Choose how ASA should read this content. ${HOSTED_RESOURCE_FORMAT_OPTIONS.find((option) => option.value === draft.format)?.description ?? ""}`
                    : `${HOSTED_RESOURCE_KIND_LABELS[draft.kind]} resources use this format.`
                }
                data={HOSTED_RESOURCE_FORMAT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={draft.format}
                disabled={draft.kind !== null}
                onChange={(value) => {
                  if (value !== null) {
                    props.onChange({ format: value as HostedResourceEditorDraft["format"] });
                  }
                }}
                allowDeselect={false}
                data-hosted-resource-format
              />
            </>
          ) : (
            <>
              <AppAlert color="attention" variant="light" title="The format cannot be changed">
                <Stack gap={4}>
                  <Text size="sm">
                    The format was set when this resource was created. It controls validation and the content type ASA
                    receives, so types that need another format are unavailable.
                  </Text>
                  <Text size="sm">
                    You can clear the type and keep serving the URL, but setting selectors will no longer offer it. To
                    use a different format, create a new resource.
                  </Text>
                </Stack>
              </AppAlert>
              <Text size="sm" c="dimmed">
                Saving publishes a new version immediately. Previous versions remain available under Revisions.
              </Text>
            </>
          )}
          <Textarea
            label="Notes"
            placeholder="e.g. Shared admin list for the PvE cluster"
            description="Optional notes, visible only in YARK."
            value={draft.notes}
            onChange={(event) => props.onChange({ notes: event.currentTarget.value })}
            maxLength={HOSTED_RESOURCES_MAX_NOTES_LENGTH}
            minRows={2}
            maxRows={4}
            data-hosted-resource-notes
          />
          <TagsInput
            label="Tags"
            placeholder="Add a tag"
            description="Optional labels for finding this resource; they do not affect compatibility."
            data={HOSTED_RESOURCE_TAG_OPTIONS}
            value={draft.tagsText
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)}
            onChange={(tags) => props.onChange({ tagsText: tags.map((tag) => tag.trim().toLowerCase()).join(", ") })}
            splitChars={[","]}
            maxTags={HOSTED_RESOURCES_MAX_TAGS}
            clearable
            data-hosted-resource-tags
          />
          <Textarea
            label="Resource content"
            placeholder={contentPlaceholder(draft.format)}
            description={`Validated as ${formatLabel(draft.format)} before publishing. Maximum ${formatByteSize(HOSTED_RESOURCES_MAX_CONTENT_BYTES)}.`}
            value={draft.content}
            onChange={(event) => props.onChange({ content: event.currentTarget.value })}
            autosize
            minRows={8}
            maxRows={18}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            data-hosted-resource-content
          />
          <Text size="xs" c={overLimit ? "red" : "dimmed"} data-hosted-resource-size>
            {formatByteSize(contentBytes)} / {formatByteSize(HOSTED_RESOURCES_MAX_CONTENT_BYTES)}
            {overLimit ? " — over the limit" : ""}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={props.onClose}>
              Cancel
            </Button>
            <Button loading={props.busy} disabled={overLimit} onClick={props.onSubmit}>
              {isCreate ? "Create resource" : "Save changes"}
            </Button>
          </Group>
        </Stack>
      )}
    </AppPanelModal>
  );
}
