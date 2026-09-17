import type { ReactElement } from "react";
import {
  Button,
  Group,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  HOSTED_RESOURCES_MAX_CONTENT_BYTES,
  HOSTED_RESOURCES_MAX_DISPLAY_NAME_LENGTH,
  HOSTED_RESOURCES_MAX_NOTES_LENGTH,
  HOSTED_RESOURCES_MAX_TAGS,
  HOSTED_RESOURCE_TAG_OPTIONS,
} from "@shared/settings/hosted-resources";
import { AppPanelModal } from "@ui/AppPanelModal/AppPanelModal";
import {
  contentByteLength,
  contentPlaceholder,
  formatByteSize,
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
  return (
    <AppPanelModal
      opened={draft !== null}
      onClose={props.onClose}
      title={isCreate ? "New hosted resource" : `Edit content · ${draft?.displayName ?? ""}`}
      meta={isCreate ? "Publish a local URL for ASA to load" : "Update the content served by this URL"}
      size={672}
    >
      {draft !== null && (
        <Stack gap="sm">
          <TextInput
            label="Display name"
            placeholder="Admins allowlist"
            value={draft.displayName}
            onChange={(event) => props.onChange({ displayName: event.currentTarget.value })}
            maxLength={HOSTED_RESOURCES_MAX_DISPLAY_NAME_LENGTH}
            required
            data-hosted-resource-name
          />
          {isCreate ? (
            <>
              <Select
                label="Format"
                description={
                  HOSTED_RESOURCE_FORMAT_OPTIONS.find(
                    (option) => option.value === draft.format,
                  )?.description
                }
                data={HOSTED_RESOURCE_FORMAT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={draft.format}
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
            <Text size="sm" c="dimmed">
              Save publishes a new version immediately. The previous version is kept and
              can be restored from Revisions.
            </Text>
          )}
          <Textarea
            label="Operator notes"
            placeholder="What is this resource used for?"
            description="Shown only in YARK to help identify the resource."
            value={draft.notes}
            onChange={(event) => props.onChange({ notes: event.currentTarget.value })}
            maxLength={HOSTED_RESOURCES_MAX_NOTES_LENGTH}
            minRows={2}
            maxRows={4}
            data-hosted-resource-notes
          />
          <TagsInput
            label="Tags"
            placeholder="Select or create tags"
            description="Choose an ASA use or create a custom tag for mods and local conventions."
            data={HOSTED_RESOURCE_TAG_OPTIONS}
            value={draft.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean)}
            onChange={(tags) =>
              props.onChange({ tagsText: tags.map((tag) => tag.trim().toLowerCase()).join(", ") })
            }
            splitChars={[","]}
            maxTags={HOSTED_RESOURCES_MAX_TAGS}
            clearable
            data-hosted-resource-tags
          />
          <Textarea
            label="Content"
            placeholder={contentPlaceholder(draft.format)}
            description={`Validated as UTF-8 before saving. Max ${formatByteSize(
              HOSTED_RESOURCES_MAX_CONTENT_BYTES,
            )}.`}
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
              {isCreate ? "Create resource" : "Save"}
            </Button>
          </Group>
        </Stack>
      )}
    </AppPanelModal>
  );
}
