import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Group,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  countAsaBrowseLaunchOptions,
  filterLaunchOptions,
  type AsaLaunchOptionEntry,
  type AsaLaunchOptionStatus,
} from "@shared/asa-launch-options-catalog";
import { SearchField } from "@ui/SearchField/SearchField";
import {
  CATALOG_STATUS_FILTERS,
  catalogBrowseSecondary,
  catalogStatusFilterTooltip,
  catalogStatusLabel,
  catalogStatusToneClass,
  isInformativeDefaultSemantics,
  shouldShowCatalogNotes,
  type CatalogStatusFilter,
} from "./launchOptionsCatalogModel";
import classes from "./LaunchOptionsCatalogModal.module.css";

interface Props {
  inputSize: "xs" | "sm";
}

type BrowseStatus = Exclude<AsaLaunchOptionStatus, "unsupported">;

function isBrowseStatus(status: AsaLaunchOptionStatus): status is BrowseStatus {
  return status !== "unsupported";
}

function StatusBadge({ status }: { status: BrowseStatus }): ReactElement {
  return (
    <span className={classes[catalogStatusToneClass(status)]}>
      {catalogStatusLabel(status)}
    </span>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className={classes.metaRow}>
      <Text size="xs" c="dimmed" tt="uppercase" className={classes.metaLabel}>
        {label}
      </Text>
      <div className={classes.metaValue}>{children}</div>
    </div>
  );
}

export function LaunchOptionsCatalogEntriesTab(props: Props): ReactElement {
  const [filter, setFilter] = useState<CatalogStatusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries = useMemo(
    () => filterLaunchOptions({ status: filter, query, asaOnly: true }),
    [filter, query],
  );

  useEffect(() => {
    if (entries.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (selectedId === null || !entries.some((entry) => entry.id === selectedId)) {
      setSelectedId(entries[0]!.id);
    }
  }, [entries, selectedId]);

  const selected: AsaLaunchOptionEntry | undefined =
    entries.find((entry) => entry.id === selectedId) ?? entries[0];
  const selectedSecondary =
    selected !== undefined && isBrowseStatus(selected.status)
      ? catalogBrowseSecondary(selected)
      : null;

  const counts = useMemo(() => countAsaBrowseLaunchOptions(), []);

  return (
    <div className={classes.split}>
      <section className={classes.listColumn}>
        <div className={classes.listToolbar}>
          <Group gap={6} wrap="wrap">
            {CATALOG_STATUS_FILTERS.map((key) => {
              const active = filter === key;
              return (
                <Tooltip
                  key={key}
                  label={catalogStatusFilterTooltip(key)}
                  withArrow
                  multiline
                  maw={280}
                  events={{ hover: true, focus: true, touch: false }}
                >
                  <UnstyledButton
                    type="button"
                    aria-label={`${catalogStatusLabel(key)} filter`}
                    className={active ? classes.filterActive : classes.filter}
                    onClick={() => setFilter(key)}
                  >
                    {catalogStatusLabel(key)}
                    <span className={classes.filterCount}>{counts[key]}</span>
                  </UnstyledButton>
                </Tooltip>
              );
            })}
          </Group>
          <SearchField
            size={props.inputSize}
            placeholder="Search token, alias, category…"
            label="Search launch options catalog"
            value={query}
            onChange={setQuery}
          />
        </div>

        <div className={classes.listPane} data-catalog-list-pane>
          <Stack gap="xs">
            {entries.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="lg">
                No ASA entries match this filter.
              </Text>
            )}
            {entries.map((entry) => {
              if (!isBrowseStatus(entry.status)) return null;
              const active = selected?.id === entry.id;
              const secondary = catalogBrowseSecondary(entry);
              return (
                <UnstyledButton
                  key={entry.id}
                  type="button"
                  className={active ? classes.rowActive : classes.row}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <Group justify="space-between" gap="sm" wrap="nowrap" align="flex-start">
                    <div style={{ minWidth: 0 }}>
                      <Text className={classes.token} lineClamp={1}>
                        {entry.token}
                      </Text>
                      <Text className={classes.tokenMeta} lineClamp={1}>
                        {entry.category} · {entry.valueType}
                      </Text>
                    </div>
                    <StatusBadge status={entry.status} />
                  </Group>
                  <Text className={classes.rowDesc} lineClamp={2}>
                    {entry.summary}
                  </Text>
                  <Text className={classes.rowExample} lineClamp={1}>
                    Example: {entry.example}
                  </Text>
                  {secondary?.kind === "managed" ? (
                    <div className={classes.rowManaged}>{secondary.text}</div>
                  ) : null}
                  {secondary?.kind === "conflicts" ? (
                    <div className={classes.rowConflicts}>
                      Conflicts: {secondary.items.join(", ")}
                    </div>
                  ) : null}
                </UnstyledButton>
              );
            })}
          </Stack>
        </div>
      </section>

      <aside className={classes.detailColumn}>
        {selected && isBrowseStatus(selected.status) ? (
          <>
            <div className={classes.detailHeader}>
              <Group gap={6} wrap="wrap">
                <StatusBadge status={selected.status} />
                <span className={classes.chip}>{selected.category}</span>
                <span className={classes.chipMono}>{selected.valueType}</span>
              </Group>
              <Text className={classes.detailToken}>{selected.token}</Text>
            </div>

            <div className={classes.detailPane} data-catalog-detail-pane>
              <div className={classes.metaBlock}>
                <MetaRow label="Summary">{selected.summary}</MetaRow>
                {selected.details ? (
                  <MetaRow label="Details">{selected.details}</MetaRow>
                ) : null}
                <MetaRow label="Example">
                  <span className={classes.mono}>{selected.example}</span>
                </MetaRow>
                {isInformativeDefaultSemantics(selected.defaultSemantics) ? (
                  <MetaRow label="Default">{selected.defaultSemantics}</MetaRow>
                ) : null}
                {selected.aliases.length > 0 ? (
                  <MetaRow label="Aliases">
                    <span className={classes.mono}>
                      {selected.aliases.join(", ")}
                    </span>
                  </MetaRow>
                ) : null}
                {selectedSecondary?.kind === "managed" ? (
                  <MetaRow label="Where to change it">{selectedSecondary.text}</MetaRow>
                ) : null}
                {selectedSecondary?.kind === "conflicts" ? (
                  <MetaRow label="Conflicts">
                    <Stack gap={4}>
                      {selectedSecondary.items.map((conflict) => (
                        <Text
                          key={conflict}
                          span
                          size="sm"
                          c="attention"
                          className={classes.mono}
                        >
                          {conflict}
                        </Text>
                      ))}
                    </Stack>
                  </MetaRow>
                ) : null}
                {shouldShowCatalogNotes(selected) ? (
                  <MetaRow label="Notes">
                    <Text size="sm" c="yellow.4">
                      {selected.notes}
                    </Text>
                  </MetaRow>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <Text size="sm" c="dimmed" p="md">
            Select an entry to inspect metadata.
          </Text>
        )}
      </aside>
    </div>
  );
}
