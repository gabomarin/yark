import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Badge, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { formatMapDisplayName } from "@shared/asa/map-identity";
import {
  lookupSupplyCrate,
  supplyCrateFit,
  supplyCrateFitLabel,
  type SupplyCrateFit,
} from "@shared/asa/asa-supply-crate-catalog";
import {
  draftForNewCrate,
  draftFromSupplyCrate,
  reviewSupplyCrateState,
  summarizeSupplyCrates,
  supplyCrateRowKey,
  type SupplyCrateDraft,
  type SupplyCrateEdit,
  type SupplyCratePendingAdd,
} from "@shared/ini/supply-crate-entries";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import { LootClassField } from "./LootClassField";
import { LootCrateDetail } from "./LootCrateDetail";
import { LootMapReview } from "./LootMapReview";
import { LootSimulatorPanel } from "./LootSimulatorPanel";
import { LootPaneSwitch } from "./IniScopeSwitch";

const FIT_COLOR: Record<SupplyCrateFit, string> = {
  active: "blue",
  shared: "gray",
  unused: "yellow",
  unknown: "gray",
};

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

export function LootEditor(props: Props): ReactElement {
  const summary = useMemo(() => summarizeSupplyCrates(props.gameText), [props.gameText]);
  const lineKey = summary.rows.map((row) => `${row.occurrence}:${row.expectedRaw}`).join("\n");
  const [seenLines, setSeenLines] = useState(lineKey);
  const [drafts, setDrafts] = useState<Record<string, SupplyCrateDraft>>(() => draftsFrom(summary.rows));
  const [pending, setPending] = useState<SupplyCratePendingAdd[]>([]);
  const [pane, setPane] = useState<"crates" | "simulator">("crates");
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [blank, setBlank] = useState("");
  const [blankError, setBlankError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [seenMap, setSeenMap] = useState(props.map);
  if (seenLines !== lineKey) {
    setSeenLines(lineKey);
    setDrafts(draftsFrom(summary.rows));
    setPending([]);
    setSelected(null);
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

  const acceptClass = (className: string): void => {
    const id = crypto.randomUUID();
    setPending((current) => [...current, { id, body: draftForNewCrate(className) }]);
    setSelected(id);
    setBlank("");
    setBlankError("");
  };

  return (
    <Stack gap="sm" data-loot-editor>
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
      {pane === "simulator" ? <LootSimulatorPanel body={selectedBody ?? null} /> : null}
      {pane === "crates" ? (
        <Group align="flex-start" wrap="nowrap">
          <Stack gap="xs" w={300}>
            <TextInput
              aria-label="Filter crates"
              placeholder="Filter crates"
              size="xs"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
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
              const fit = supplyCrateFit(draft.className, props.map);
              return (
                <Button
                  key={key}
                  variant={selected === key ? "light" : "subtle"}
                  justify="space-between"
                  onClick={() => setSelected(key)}
                >
                  <Text size="sm" td={draft.removed ? "line-through" : undefined}>
                    {crateLabel(draft.className)}
                  </Text>
                  <Badge size="xs" variant="light" color={FIT_COLOR[fit]}>
                    {supplyCrateFitLabel(fit)}
                  </Badge>
                </Button>
              );
            })}
            {pending.map((item) => {
              const fit = supplyCrateFit(item.body.className, props.map);
              return (
                <Button
                  key={item.id}
                  variant={selected === item.id ? "light" : "subtle"}
                  justify="space-between"
                  onClick={() => setSelected(item.id)}
                >
                  <Text size="sm">{crateLabel(item.body.className)}</Text>
                  <Badge size="xs" variant="light" color={FIT_COLOR[fit]}>
                    {supplyCrateFitLabel(fit)}
                  </Badge>
                </Button>
              );
            })}
            <LootClassField
              ariaLabel="Add a crate"
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
          </Stack>
          <Stack flex={1}>
            {selectedBody === undefined ? (
              <Text size="sm" c="dimmed">
                Select a crate, or add one. A class is saved only after it has an item with a weight and a quantity.
              </Text>
            ) : (
              <LootCrateDetail
                body={selectedBody}
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
                    current.map((item) =>
                      item.id === selected ? { ...item, body: { ...body, removed: false } } : item,
                    ),
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
      ) : null}
    </Stack>
  );
}
