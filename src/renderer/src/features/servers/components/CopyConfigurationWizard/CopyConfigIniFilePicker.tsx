import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Checkbox,
  Group,
  ScrollArea,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { ConfigTransferIniFileSelection } from "@shared/config-transfer";
import type { ConfigTransferIniCategoryInfo } from "@shared/types";
import {
  MERGE_STRATEGY_TOOLTIP,
  REPLACE_STRATEGY_TOOLTIP,
  categorySelectionState,
  fileSelectionState,
  iniKeyRefId,
  selectedIniKeyIds,
  setIniStrategy,
  shortSectionLabel,
  toggleIniCategoryKeys,
  toggleIniEntireFile,
  toggleIniKey,
} from "../../copyConfigurationModel";
import { CopyConfigCategoryCard } from "./CopyConfigCategoryCard";
import { CopyConfigStrategyToggle } from "./CopyConfigStrategyToggle";
import classes from "./CopyConfigIniFilePicker.module.css";

interface Props {
  title: string;
  description?: string;
  file: ConfigTransferIniFileSelection;
  categories: ConfigTransferIniCategoryInfo[];
  onChange: (next: ConfigTransferIniFileSelection) => void;
}

export function CopyConfigIniFilePicker(props: Props): ReactElement {
  const { file, categories, onChange } = props;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const didInitExpand = useRef(false);

  useEffect(() => {
    if (categories.length === 0) {
      didInitExpand.current = false;
      setExpanded(new Set());
      return;
    }
    if (didInitExpand.current) return;
    didInitExpand.current = true;
    const first = categories[0];
    if (first !== undefined) {
      setExpanded(new Set([first.id]));
    }
  }, [categories]);

  const fileState = fileSelectionState(file, categories);
  const selected = selectedIniKeyIds(file, categories);
  const active = fileState.checked || fileState.indeterminate;

  const toggleCategoryOpen = (categoryId: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  return (
    <CopyConfigCategoryCard
      title={props.title}
      description={
        props.description ??
        (categories.length === 0
          ? "No settings found in the source file."
          : `${selected.size} of ${categories.reduce((n, c) => n + c.keys.length, 0)} settings selected`)
      }
      checked={fileState.checked}
      indeterminate={fileState.indeterminate}
      onChange={(enabled) =>
        onChange(toggleIniEntireFile(file, enabled, categories))
      }
    >
      {active ? (
        <>
          <Group gap="xs" mb="xs">
            <CopyConfigStrategyToggle
              strategy={file.strategy}
              mergeTooltip={MERGE_STRATEGY_TOOLTIP}
              replaceTooltip={REPLACE_STRATEGY_TOOLTIP}
              onChange={(strategy) =>
                onChange(setIniStrategy(file, strategy))
              }
            />
            <Text size="xs" c="dimmed">
              {selected.size} selected
            </Text>
          </Group>

          {categories.length === 0 ? (
            <Text size="xs" c="dimmed">
              No settings found in the source file.
            </Text>
          ) : (
            <ScrollArea.Autosize
              mah={280}
              type="auto"
              offsetScrollbars
              className={classes.sectionsScroll}
            >
              <div className={classes.sections}>
                {categories.map((category) => {
                  const open = expanded.has(category.id);
                  const state = categorySelectionState(
                    file,
                    categories,
                    category.id,
                  );
                  return (
                    <div key={category.id} className={classes.section}>
                      <div className={classes.sectionHeader}>
                        <Checkbox
                          aria-label={`Select all in ${category.label}`}
                          checked={state.checked}
                          indeterminate={state.indeterminate}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onChange(
                              toggleIniCategoryKeys(
                                file,
                                categories,
                                category.id,
                                e.currentTarget.checked,
                              ),
                            )
                          }
                        />
                        <UnstyledButton
                          type="button"
                          className={classes.sectionToggle}
                          onClick={() => toggleCategoryOpen(category.id)}
                          aria-expanded={open}
                        >
                          <Group gap={6} wrap="nowrap">
                            {open ? (
                              <CaretDown size={14} />
                            ) : (
                              <CaretRight size={14} />
                            )}
                            <Text
                              size="xs"
                              fw={500}
                              className={classes.sectionTitle}
                              title={category.label}
                            >
                              {category.label}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {state.selectedCount}/{state.total}
                            </Text>
                          </Group>
                        </UnstyledButton>
                      </div>
                      {open ? (
                        <ul className={classes.keyList}>
                          {category.keys.map((row) => {
                            const id = iniKeyRefId(row.section, row.key);
                            return (
                              <li key={id} className={classes.keyRow}>
                                <Checkbox
                                  size="xs"
                                  checked={selected.has(id)}
                                  onChange={(e) =>
                                    onChange(
                                      toggleIniKey(
                                        file,
                                        categories,
                                        row.section,
                                        row.key,
                                        e.currentTarget.checked,
                                      ),
                                    )
                                  }
                                  label={
                                    <Group gap={6} wrap="nowrap">
                                      <Text size="xs" ff="monospace">
                                        {row.key}
                                      </Text>
                                      <Text size="xs" c="dimmed" ff="monospace">
                                        [{shortSectionLabel(row.section)}]
                                      </Text>
                                    </Group>
                                  }
                                />
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ScrollArea.Autosize>
          )}
        </>
      ) : null}
    </CopyConfigCategoryCard>
  );
}
