import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Box, Group, Stack, Text, TextInput } from "@mantine/core";
import { formatMapDisplayName } from "@shared/asa/map-identity";
import { lookupSupplyCrate, supplyCrateFit, supplyCrateFitHint } from "@shared/asa/asa-supply-crate-catalog";
import {
  draftForNewCrate,
  draftFromSupplyCrate,
  reviewSupplyCrateState,
  summarizeSupplyCrates,
  supplyCrateBodyIssue,
  supplyCrateRowKey,
  type SupplyCrateDraft,
  type SupplyCrateEdit,
  type SupplyCratePendingAdd,
} from "@shared/ini/supply-crate-entries";
import { keepSupplyCrateSelection } from "@shared/ini/loot-crate-selection";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { LootClassField } from "./LootClassField";
import { LootCrateDetail } from "./LootCrateDetail";
import { LootCrateRow } from "./LootCrateRow";
import { LootMapReview } from "./LootMapReview";
import { LootSimulatorPanel } from "./LootSimulatorPanel";
import { LootPaneSwitch } from "./IniScopeSwitch";
import classes from "./ConfigurationEditor.module.css";

export interface LootEditorStatus {
  edits: SupplyCrateEdit[];
  blocked: boolean;
  invalid: boolean;
}

interface Props {
  gameText: string;
  map: string;
  loading: boolean;
  busy: boolean;
  initialCrate?: { key: string; className: string } | null;
  onOpenCrateChange?: (crate: { key: string; className: string } | null) => void;
  onStatus: (status: LootEditorStatus) => void;
}

function draftsFrom(rows: ReturnType<typeof summarizeSupplyCrates>["rows"]): Record<string, SupplyCrateDraft> {
  const drafts: Record<string, SupplyCrateDraft> = {};
  for (const row of rows) drafts[supplyCrateRowKey(row)] = draftFromSupplyCrate(row);
  return drafts;
}

function crateLabel(className: string): string {
  return lookupSupplyCrate(className)?.label ?? className;
}

function crateSaveStatus(body: SupplyCrateDraft): string | null {
  if (body.removed) return null;
  const issue = supplyCrateBodyIssue(body);
  if (issue === null) return null;
  if (issue === "Enter a quantity.") return "Needs a quantity";
  if (issue.startsWith("Add an item")) return "Needs an item";
  return "Cannot save";
}

export function LootEditor(props: Props): ReactElement {
  const summary = useMemo(() => summarizeSupplyCrates(props.gameText), [props.gameText]);
  const lineKey = summary.rows.map((row) => `${row.occurrence}:${row.expectedRaw}`).join("\n");
  const [seenLines, setSeenLines] = useState(lineKey);
  const [drafts, setDrafts] = useState<Record<string, SupplyCrateDraft>>(() => draftsFrom(summary.rows));
  const [pending, setPending] = useState<SupplyCratePendingAdd[]>([]);
  const [pane, setPane] = useState<"crates" | "simulator">("crates");
  const [selected, setSelected] = useState<string | null>(() =>
    keepSupplyCrateSelection(
      props.initialCrate?.key ?? null,
      props.initialCrate === undefined || props.initialCrate === null
        ? []
        : [{ id: props.initialCrate.key, body: { className: props.initialCrate.className } }],
      {},
      summary.rows,
    ),
  );
  const [search, setSearch] = useState("");
  const [blank, setBlank] = useState("");
  const [blankError, setBlankError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [seenMap, setSeenMap] = useState(props.map);
  if (seenLines !== lineKey) {
    setSeenLines(lineKey);
    setSelected(keepSupplyCrateSelection(selected, pending, drafts, summary.rows));
    setDrafts(draftsFrom(summary.rows));
    setPending([]);
  }
  if (seenMap !== props.map) {
    const previous = seenMap;
    setSeenMap(props.map);
    if (previous.trim().length > 0 && summary.rows.length + pending.length > 0) setReviewOpen(true);
  }

  const review = reviewSupplyCrateState(summary.rows, drafts, pending);
  const statusKey = `${blankError}\n${String(review.blocked)}\n${JSON.stringify(review.edits)}`;
  const onStatusRef = useRef(props.onStatus);
  onStatusRef.current = props.onStatus;
  useEffect(() => {
    onStatusRef.current({
      edits: review.edits,
      blocked: review.blocked,
      invalid: blankError.length > 0,
    });
  }, [statusKey, review.edits, review.blocked, blankError]);

  const query = search.trim().toLowerCase();
  const visibleRows = summary.rows.filter((row) => {
    const name = drafts[supplyCrateRowKey(row)]?.className ?? row.className;
    return query.length === 0 || name.toLowerCase().includes(query) || crateLabel(name).toLowerCase().includes(query);
  });
  const selectedRow = summary.rows.find((row) => supplyCrateRowKey(row) === selected);
  const selectedPending = pending.find((item) => item.id === selected);
  const selectedBody = selectedRow !== undefined ? drafts[supplyCrateRowKey(selectedRow)] : selectedPending?.body;
  const mapLabel = formatMapDisplayName(props.map);
  const onOpenCrateChange = useRef(props.onOpenCrateChange);
  onOpenCrateChange.current = props.onOpenCrateChange;
  const openClass = selectedBody?.className ?? null;
  useEffect(() => {
    onOpenCrateChange.current?.(
      selected !== null && openClass !== null ? { key: selected, className: openClass } : null,
    );
    if (selected === null) return;
    document.querySelector(`[data-loot-key="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected, openClass]);

  const acceptClass = (className: string): void => {
    const id = crypto.randomUUID();
    setPending((current) => [...current, { id, body: draftForNewCrate(className) }]);
    setSelected(id);
    setBlank("");
    setBlankError("");
  };

  return (
    <Stack gap="sm" data-loot-editor className={classes.lootEditor}>
      <LootPaneSwitch value={pane} onChange={setPane} />
      <Text size="xs" c="dimmed">
        Map: {mapLabel}
      </Text>
      {summary.leftoverCount > 0 ? (
        <AppAlert color="attention" title="Some crate lines were left as written">
          <Text size="sm">
            {summary.leftoverCount === 1
              ? "1 crate line uses a field this view does not edit, or it has no item."
              : `${summary.leftoverCount} crate lines use a field this view does not edit, or they have no item.`}
          </Text>
        </AppAlert>
      ) : null}
      {reviewOpen ? (
        <LootMapReview
          mapLabel={mapLabel}
          rows={[
            ...summary.rows.map((row) => ({
              key: supplyCrateRowKey(row),
              label: crateLabel(drafts[supplyCrateRowKey(row)]?.className ?? row.className),
              className: row.className,
              fit: supplyCrateFit(drafts[supplyCrateRowKey(row)]?.className ?? row.className, props.map),
            })),
            ...pending.map((item) => ({
              key: item.id,
              label: crateLabel(item.body.className),
              className: item.body.className,
              fit: supplyCrateFit(item.body.className, props.map),
            })),
          ]}
          onKeep={() => setReviewOpen(false)}
          onRemove={(keys) => {
            const keySet = new Set(keys);
            setDrafts((current) => {
              const next = { ...current };
              for (const row of summary.rows) {
                const key = supplyCrateRowKey(row);
                const draft = next[key];
                if (draft !== undefined && keySet.has(key)) next[key] = { ...draft, removed: true };
              }
              return next;
            });
            setPending((current) =>
              current.map((item) => (keySet.has(item.id) ? { ...item, body: { ...item.body, removed: true } } : item)),
            );
            setReviewOpen(false);
          }}
        />
      ) : null}
      <Group className={classes.lootColumns} align="stretch" wrap="nowrap">
        <Stack gap="xs" className={classes.lootList}>
          <TextInput
            aria-label="Filter crates"
            placeholder="Filter crates"
            size="xs"
            style={{ flexShrink: 0 }}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Box className={classes.lootListScroll}>
            <Stack gap="xs">
              {props.loading ? (
                <Text size="sm" c="dimmed">
                  Loading INI…
                </Text>
              ) : null}
              {!props.loading && summary.rows.length === 0 && pending.length === 0 ? (
                <Text size="sm" c="dimmed">
                  This Game.ini has no supply crate overrides. The game is using its own loot.
                </Text>
              ) : null}
              {visibleRows.map((row) => {
                const key = supplyCrateRowKey(row);
                const draft = drafts[key];
                if (draft === undefined) return null;
                const known = lookupSupplyCrate(draft.className);
                return (
                  <LootCrateRow
                    key={key}
                    selected={selected === key}
                    label={crateLabel(draft.className)}
                    crateClass={draft.className}
                    kind={known?.kind ?? null}
                    rowKey={key}
                    removed={draft.removed}
                    fit={supplyCrateFit(draft.className, props.map)}
                    hint={supplyCrateFitHint(draft.className, props.map)}
                    status={crateSaveStatus(draft)}
                    onClick={() => setSelected(key)}
                  />
                );
              })}
              {pending.map((item) => {
                const known = lookupSupplyCrate(item.body.className);
                return (
                  <LootCrateRow
                    key={item.id}
                    selected={selected === item.id}
                    label={crateLabel(item.body.className)}
                    crateClass={item.body.className}
                    kind={known?.kind ?? null}
                    rowKey={item.id}
                    removed={item.body.removed}
                    fit={supplyCrateFit(item.body.className, props.map)}
                    hint={supplyCrateFitHint(item.body.className, props.map)}
                    status={crateSaveStatus(item.body)}
                    onClick={() => setSelected(item.id)}
                  />
                );
              })}
            </Stack>
          </Box>
          {pane === "crates" ? (
            <Box style={{ flexShrink: 0 }}>
              <LootClassField
                ariaLabel="Add a crate"
                placeholder="Add a crate by name"
                actionLabel="Add"
                value={blank}
                error={blankError}
                disabled={props.busy}
                onChange={(value) => {
                  setBlank(value);
                  setBlankError("");
                }}
                onConfirm={acceptClass}
                onReject={setBlankError}
              />
            </Box>
          ) : null}
        </Stack>
        <Stack className={classes.lootDetail}>
          {pane === "simulator" ? (
            <LootSimulatorPanel body={selectedBody ?? null} selectionKey={selected} />
          ) : selectedBody === undefined ? (
            <Text size="sm" c="dimmed">
              Select a crate, or add one. A class is saved only after it has an item with a weight and a quantity.
            </Text>
          ) : (
            <LootCrateDetail
              body={selectedBody}
              map={props.map}
              disabled={props.busy}
              onChange={(body) => {
                if (selectedRow !== undefined) {
                  const key = supplyCrateRowKey(selectedRow);
                  setDrafts((current) => ({
                    ...current,
                    [key]: { ...body, removed: current[key]?.removed === true },
                  }));
                  return;
                }
                setPending((current) =>
                  current.map((item) => (item.id === selected ? { ...item, body: { ...body, removed: false } } : item)),
                );
              }}
              onDelete={() => {
                if (selectedRow !== undefined) {
                  const key = supplyCrateRowKey(selectedRow);
                  setDrafts((current) => {
                    const draft = current[key];
                    return draft === undefined ? current : { ...current, [key]: { ...draft, removed: true } };
                  });
                  return;
                }
                setPending((current) => current.filter((item) => item.id !== selected));
                setSelected(null);
              }}
            />
          )}
        </Stack>
      </Group>
    </Stack>
  );
}
