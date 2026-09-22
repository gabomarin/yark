import type { ReactElement } from "react";
import { Button, Combobox, InputBase, Stack, Text, useCombobox } from "@mantine/core";
import { Plus } from "@phosphor-icons/react";
import { HOSTED_RESOURCE_KIND_LABELS } from "@shared/settings/hosted-resources";
import type { HostedResourceConsumer } from "@shared/settings/hosted-resource-consumers";
import {
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

/**
 * Searchable URL field for a setting that accepts a Hosted Resource (#577). Typing a URL
 * still works — the dropdown only adds discovery, and nothing here rewrites the value.
 */
export function HostedResourceSelector(props: Props): ReactElement {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const { resources, hostEnabled, reload } = useHostedResourceOptions();
  const create = useHostedResourceQuickCreate(props.consumer, (url) => {
    props.onChange(url);
    // Without the refetch the just-created URL has no matching resource here, and the field
    // flags it as "no current resource serves it".
    void reload();
  });
  const options = compatibleResources(resources, props.consumer);
  const assignment = classifyHostedResourceValue(props.value, resources, props.consumer);
  const issue = assignmentIssueMessage(assignment, props.consumer);
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
            props.onChange(optionValue);
            combobox.closeDropdown();
          }}
        >
          <Combobox.Target>
            <InputBase
              label={props.label === null ? undefined : (props.label ?? props.consumer.setting)}
              description={props.description}
              size={props.size}
              disabled={props.disabled}
              value={props.value}
              onChange={(event) => props.onChange(event.currentTarget.value)}
              // Option picking is click-only: an auto-opened dropdown lets Enter/ArrowDown
              // replace a hand-typed URL with the highlighted option, which would rewrite
              // the value the operator typed.
              onClick={() => combobox.openDropdown()}
              onBlur={() => combobox.closeDropdown()}
              onKeyDown={(event) => {
                if (event.key === "Enter") combobox.closeDropdown();
              }}
              rightSection={<Combobox.Chevron />}
              rightSectionPointerEvents="none"
              placeholder="https://…"
              data-hosted-resource-selector
            />
          </Combobox.Target>
          <Combobox.Dropdown>
            {options.length === 0 ? (
              <Combobox.Empty>No enabled {kindLabel.toLowerCase()} resource yet.</Combobox.Empty>
            ) : (
              <Combobox.Options>
                {options.map((resource) => (
                  <Combobox.Option key={resource.id} value={resource.url} aria-label={resource.displayName}>
                    <Stack gap={0}>
                      <Text size="sm">{resource.displayName}</Text>
                      <Text size="xs" c="dimmed">
                        {resource.url}
                      </Text>
                    </Stack>
                  </Combobox.Option>
                ))}
              </Combobox.Options>
            )}
          </Combobox.Dropdown>
        </Combobox>

        {issue !== null ? (
          <Text
            size="xs"
            c={
              assignment.issue === "missing" || assignment.issue === "disabled" || assignment.issue === "stale-port"
                ? "red"
                : "attention"
            }
          >
            {issue}
          </Text>
        ) : null}

        {isEmpty && props.disabled !== true ? (
          <>
            <Button
              size="xs"
              variant="light"
              w="fit-content"
              leftSection={<Plus size={12} weight="bold" />}
              onClick={create.open}
            >
              Create {kindLabel.toLowerCase()} resource
            </Button>
            {!hostEnabled ? (
              <Text size="xs" c="dimmed">
                Hosted Resources is off; the URL starts serving once you turn it on.
              </Text>
            ) : null}
          </>
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
