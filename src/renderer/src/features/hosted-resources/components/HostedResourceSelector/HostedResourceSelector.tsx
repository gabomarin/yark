import type { ReactElement } from "react";
import { Button, Combobox, Divider, Group, InputBase, Stack, Text, Tooltip, useCombobox } from "@mantine/core";
import { CaretDown, LinkSimple, ListBullets, Plus } from "@phosphor-icons/react";
import { HOSTED_RESOURCE_KIND_LABELS } from "@shared/settings/hosted-resources";
import type { HostedResourceConsumer } from "@shared/settings/hosted-resource-consumers";
import {
  assignmentIssueColor,
  assignmentIssueMessage,
  classifyHostedResourceValue,
  compatibleResources,
} from "../../model/hostedResourceAssignment";
import { useHostedResourceOptions } from "../../hooks/useHostedResourceOptions";
import { useHostedResourceQuickCreate } from "../../hooks/useHostedResourceQuickCreate";
import { HostedResourceEditorModal } from "../HostedResourceEditorModal/HostedResourceEditorModal";

interface Props {
  consumer: HostedResourceConsumer;
  value: string;
  /** `null` hides the label when the surrounding surface already renders one. */
  label?: string | null;
  description?: string;
  size?: "xs" | "sm";
  disabled?: boolean;
  onChange: (value: string) => void;
}

/** Sentinel option value: can never collide with a served URL, and opens the create modal. */
const CREATE_OPTION_VALUE = "__yark_create_hosted_resource__";

/**
 * URL field for a setting that accepts a Hosted Resource (#577). Typing a URL always works.
 * The resource list opens only from the picker button — focusing or typing never replaces
 * a hand-typed value — and lists every compatible resource, ignoring whatever the field holds.
 */
export function HostedResourceSelector(props: Props): ReactElement {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const { resources, hostEnabled, loaded, reload } = useHostedResourceOptions();
  const create = useHostedResourceQuickCreate(props.consumer, async (url) => {
    // Refetch before handing the URL back: otherwise the just-created token is classified
    // against the old list and flashes "no current resource serves it".
    await reload();
    props.onChange(url);
  });
  const options = compatibleResources(resources, props.consumer);
  const assignment = classifyHostedResourceValue(props.value, resources, props.consumer);
  // Until the catalog has loaded, an unmatched token may simply not be listed yet.
  const missingHidden = !loaded && assignment.issue === "missing";
  const issue = missingHidden ? null : assignmentIssueMessage(assignment, props.consumer);
  const issueColor = missingHidden || assignment.issue === null ? null : assignmentIssueColor(assignment.issue);
  const kindLabel = HOSTED_RESOURCE_KIND_LABELS[props.consumer.kind];
  const isEmpty = props.value.trim().length === 0;

  return (
    <>
      <Stack gap={4}>
        <Combobox
          store={combobox}
          withinPortal
          position="bottom-start"
          width="target"
          onOptionSubmit={(optionValue) => {
            if (optionValue === CREATE_OPTION_VALUE) {
              combobox.closeDropdown();
              create.open();
              return;
            }
            props.onChange(optionValue);
            combobox.closeDropdown();
          }}
        >
          <Combobox.Target withExpandedAttribute>
            <InputBase
              label={props.label === null ? undefined : (props.label ?? props.consumer.setting)}
              description={props.description ?? "Type a URL or select a YARK Hosted Resource."}
              size={props.size}
              disabled={props.disabled}
              value={props.value}
              onChange={(event) => props.onChange(event.currentTarget.value)}
              // Clicking back into the field to edit a URL closes the list instead of
              // leaving it floating over the form (opening stays button-only).
              onFocus={() => combobox.closeDropdown()}
              placeholder="https://…"
              leftSection={<LinkSimple size={14} />}
              leftSectionPointerEvents="none"
              // Section sized for the english "Choose" label + caret; the +6px keeps the
              // last typed character off the picker. Re-check both if the label changes.
              styles={{ input: { paddingInlineEnd: "calc(var(--input-right-section-size) + 6px)" } }}
              rightSectionWidth={92}
              rightSectionPointerEvents="all"
              rightSection={
                <Tooltip label="Choose a YARK Hosted Resource" withArrow openDelay={400}>
                  <Button
                    size="compact-xs"
                    variant="default"
                    w="100%"
                    h="100%"
                    styles={{ root: { borderRadius: "0 var(--input-radius) var(--input-radius) 0" } }}
                    leftSection={<ListBullets size={12} />}
                    rightSection={<CaretDown size={10} weight="bold" />}
                    disabled={props.disabled}
                    onClick={() => combobox.toggleDropdown()}
                    aria-label="Choose a YARK Hosted Resource"
                  >
                    Choose
                  </Button>
                </Tooltip>
              }
              data-hosted-resource-selector
            />
          </Combobox.Target>
          <Combobox.Dropdown>
            <Combobox.Options>
              <Combobox.Option value={CREATE_OPTION_VALUE}>
                <Group gap={6} wrap="nowrap">
                  <Plus size={12} weight="bold" />
                  Create {kindLabel.toLowerCase()} resource
                </Group>
              </Combobox.Option>
              {options.length > 0 ? (
                <>
                  <Divider my={4} aria-hidden />
                  {options.map((resource) => (
                    <Combobox.Option key={resource.id} value={resource.url} aria-label={resource.displayName}>
                      <Stack gap={0} style={{ minWidth: 0 }}>
                        <Text size="sm" truncate>
                          {resource.displayName}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {resource.url}
                        </Text>
                      </Stack>
                    </Combobox.Option>
                  ))}
                </>
              ) : (
                <Combobox.Empty>No enabled {kindLabel.toLowerCase()} resource yet.</Combobox.Empty>
              )}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>

        {issue !== null && issueColor !== null ? (
          <Text size="xs" c={issueColor}>
            {issue}
          </Text>
        ) : null}

        {isEmpty && props.disabled !== true && !hostEnabled ? (
          <Text size="xs" c="dimmed">
            Hosted Resources is off; the URL starts serving once you turn it on.
          </Text>
        ) : null}
      </Stack>

      <HostedResourceEditorModal
        draft={create.draft}
        busy={create.busy}
        onChange={create.update}
        onClose={create.close}
        onSubmit={create.submit}
      />
    </>
  );
}
