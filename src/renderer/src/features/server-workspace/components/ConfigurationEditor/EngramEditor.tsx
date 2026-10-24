import { useMemo, useRef, useState, type ReactElement } from "react";
import { Text, TextInput, Tooltip } from "@mantine/core";
import { lookupAsaEngram } from "@shared/asa/asa-engram-catalog";
import {
  namedEngramRowKey,
  summarizeNamedEngrams,
  type NamedEngramDraft,
  type NamedEngramPendingAdd,
  type NamedEngramRow,
} from "@shared/ini/engram-named-entries";
import { appRaisedSurfaceClass, withAppSurface } from "@ui/AppSurface/appSurfaceClassName";
import { AppAlert } from "@ui/AppAlert/AppAlert";
import classes from "./ConfigurationEditor.module.css";
import { EngramDraftRow } from "./EngramDraftRow";
import { EngramEditorRow } from "./EngramEditorRow";

interface Props {
  gameText: string;
  drafts: Readonly<Record<string, NamedEngramDraft>>;
  pending: readonly NamedEngramPendingAdd[];
  loading: boolean;
  busy: boolean;
  onDraftChange: (row: NamedEngramRow, draft: NamedEngramDraft) => void;
  onPendingChange: (id: string, draft: NamedEngramDraft) => void;
  onAdd: (draft: NamedEngramDraft, listEngram: boolean) => void;
  onDraftInvalidChange?: (invalid: boolean) => void;
}

function leftoverLabel(count: number): string {
  return count === 1 ? "1 engram line was left as written." : `${count} engram lines were left as written.`;
}

function classKey(name: string): string {
  return name.trim().toLowerCase();
}

function duplicateKeys(
  rows: readonly NamedEngramRow[],
  drafts: Readonly<Record<string, NamedEngramDraft>>,
  pending: readonly NamedEngramPendingAdd[],
): Set<string> {
  const counts = new Map<string, number>();
  const add = (name: string): void => {
    const key = classKey(name);
    if (key.length === 0) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const row of rows) {
    const draft = drafts[namedEngramRowKey(row)];
    if (draft?.removed) continue;
    add(draft?.className ?? row.className);
  }
  for (const item of pending) {
    if (item.draft.removed) continue;
    add(item.draft.className);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

function matchesQuery(query: string, className: string): boolean {
  if (query.length === 0) return true;
  const label = lookupAsaEngram(className)?.label ?? "";
  return className.toLowerCase().includes(query) || label.toLowerCase().includes(query);
}

export function EngramEditor(props: Props): ReactElement {
  const summary = useMemo(() => summarizeNamedEngrams(props.gameText), [props.gameText]);
  const [search, setSearch] = useState("");
  const blankInvalid = useRef(false);
  const searchInvalid = useRef(new Set<string>());
  const publishInvalid = (): void => {
    props.onDraftInvalidChange?.(blankInvalid.current || searchInvalid.current.size > 0);
  };
  const drafts = props.drafts;
  const pending = props.pending;
  const query = search.trim().toLowerCase();
  const duplicates = duplicateKeys(summary.rows, drafts, pending);
  const usedClassNames = useMemo(() => {
    const names = new Set<string>();
    for (const row of summary.rows) names.add(row.className.toLowerCase());
    for (const item of pending) names.add(item.draft.className.trim().toLowerCase());
    return names;
  }, [summary.rows, pending]);

  const visible = summary.rows.filter((row) => {
    const draftName = drafts[namedEngramRowKey(row)]?.className ?? row.className;
    return matchesQuery(query, draftName) || matchesQuery(query, row.className);
  });
  const visiblePending = pending.filter((item) => matchesQuery(query, item.draft.className) || matchesQuery(query, item.originClass));
  const showEmpty = !props.loading && summary.rows.length === 0 && pending.length === 0;

  return (
    <>
      {(summary.autoUnlockAll || summary.onlySpecified) && (
        <AppAlert color="attention" title="This list may not apply">
          {summary.autoUnlockAll ? <Text size="sm">Auto unlock all engrams is on, so the game ignores this list.</Text> : null}
          {summary.onlySpecified ? (
            <Text size="sm">Only listed engrams are allowed. An engram missing from the list is hidden.</Text>
          ) : null}
        </AppAlert>
      )}

      <TextInput
        placeholder="Filter this list"
        aria-label="Filter engrams in this file"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />

      <div className={withAppSurface(appRaisedSurfaceClass, classes.tableWrap)}>
        <div className={classes.engramHead}>
          <span>Engram</span>
          <Tooltip label="If on, hides this engram in the player's engram panel.">
            <span className={classes.engramCenter}>Hidden</span>
          </Tooltip>
          <Tooltip label="Engram points needed to learn it. Empty keeps the game's own cost.">
            <span>Points</span>
          </Tooltip>
          <Tooltip label="Minimum level needed to learn it. Empty keeps the game's own level.">
            <span>Level</span>
          </Tooltip>
          <Tooltip label="If on, this engram does not need its prerequisite engrams.">
            <span className={classes.engramCenter}>Remove</span>
          </Tooltip>
          <span />
        </div>
        <div className={classes.tableBody}>
          {props.loading && (
            <Text c="dimmed" p="md">
              Loading INI…
            </Text>
          )}
          {showEmpty && (
            <Text c="dimmed" p="md">
              {summary.leftoverCount === 0
                ? "This Game.ini has no named engram overrides. The game is using its own levels and costs."
                : "No named engram lines can be edited here."}
            </Text>
          )}
          {!props.loading && !showEmpty && visible.length === 0 && visiblePending.length === 0 && (
            <Text c="dimmed" p="md">
              No engrams match this search.
            </Text>
          )}
          {!props.loading &&
            visible.map((row) => {
              const draft = drafts[namedEngramRowKey(row)];
              if (draft === undefined) return null;
              const key = classKey(draft.className);
              return (
                <EngramEditorRow
                  key={namedEngramRowKey(row)}
                  row={{ ...row, duplicate: duplicates.has(key) }}
                  draft={draft}
                  usedClassNames={usedClassNames}
                  onlySpecified={summary.onlySpecified}
                  busy={props.busy}
                  onChange={(next) => props.onDraftChange(row, next)}
                  onSearchInvalid={(invalid) => {
                    const id = namedEngramRowKey(row);
                    if (invalid) searchInvalid.current.add(id);
                    else searchInvalid.current.delete(id);
                    publishInvalid();
                  }}
                />
              );
            })}
          {!props.loading &&
            visiblePending.map((item) => (
              <EngramEditorRow
                key={item.id}
                pending
                row={{
                  section: "",
                  occurrence: 0,
                  expectedRaw: "",
                  className: item.originClass,
                  hidden: null,
                  points: null,
                  level: null,
                  removePrereq: null,
                  duplicate: duplicates.has(classKey(item.draft.className)),
                }}
                draft={item.draft}
                usedClassNames={usedClassNames}
                listEngram={item.listEngram}
                onlySpecified={summary.onlySpecified}
                busy={props.busy}
                onChange={(next) => props.onPendingChange(item.id, next)}
                onSearchInvalid={(invalid) => {
                  if (invalid) searchInvalid.current.add(item.id);
                  else searchInvalid.current.delete(item.id);
                  publishInvalid();
                }}
              />
            ))}
          {!props.loading && (
            <EngramDraftRow
              busy={props.busy}
              usedClassNames={usedClassNames}
              onAdd={props.onAdd}
              onInvalidChange={(invalid) => {
                blankInvalid.current = invalid;
                publishInvalid();
              }}
            />
          )}
        </div>
      </div>

      <Text c="dimmed" size="xs">
        {summary.leftoverCount > 0 ? `${leftoverLabel(summary.leftoverCount)} ` : ""}
        {pending.length > 0
          ? "Save adds the new lines at the end of the section. Empty points and level keep the game's own values. "
          : ""}
        Named lines use OverrideNamedEngramEntries. Index lines stay as written.
      </Text>
    </>
  );
}
