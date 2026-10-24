import { useEffect, useRef, useState, type ReactElement } from "react";
import { ArrowUUpLeft, Trash } from "@phosphor-icons/react";
import { ActionIcon, NumberInput, Text, Tooltip } from "@mantine/core";
import { lookupAsaEngram } from "@shared/asa/asa-engram-catalog";
import {
  NAMED_ENGRAM_CLASS_ONLY,
  pendingEngramLacksEffect,
  reviewNamedEngramDraft,
  type NamedEngramDraft,
  type NamedEngramRow,
} from "@shared/ini/engram-named-entries";
import { AppSwitch } from "@ui/AppSwitch/AppSwitch";
import classes from "./ConfigurationEditor.module.css";
import { EngramClassField } from "./EngramClassField";

interface Props {
  row: NamedEngramRow;
  draft: NamedEngramDraft;
  busy: boolean;
  usedClassNames: ReadonlySet<string>;
  /** Added from the catalog. Not in the file until Save. */
  pending?: boolean;
  /** Hidden off is written, so the engram stays on an allow list. */
  listEngram?: boolean;
  /** `bOnlyAllowSpecifiedEngrams` is on, so Hidden off still lists the engram. */
  onlySpecified?: boolean;
  onChange: (draft: NamedEngramDraft) => void;
  onSearchInvalid?: (invalid: boolean) => void;
}

export function EngramEditorRow(props: Props): ReactElement {
  const { row, draft, busy, pending = false, listEngram = false, onlySpecified = false } = props;
  const review = reviewNamedEngramDraft(row, draft, onlySpecified);
  const classOnlyReason = !review.ok && review.reason === NAMED_ENGRAM_CLASS_ONLY;
  const showClassOnly = classOnlyReason || (pending && review.ok && pendingEngramLacksEffect(draft, listEngram));
  const unsaved = pending || !review.ok || review.edit !== null;
  const catalog = lookupAsaEngram(draft.className);
  const classLabel = pending
    ? `New engram ${draft.className || row.className}`
    : `Engram class name ${row.occurrence + 1}`;
  const [query, setQuery] = useState(draft.className);
  const [seenClass, setSeenClass] = useState(draft.className);
  const [searchError, setSearchError] = useState("");
  const notifyInvalid = useRef(props.onSearchInvalid);
  useEffect(() => {
    notifyInvalid.current = props.onSearchInvalid;
  });
  useEffect(
    () => () => {
      notifyInvalid.current?.(false);
    },
    [],
  );
  if (draft.className !== seenClass) {
    setSeenClass(draft.className);
    setQuery(draft.className);
    setSearchError("");
  }
  const otherClasses = new Set(props.usedClassNames);
  otherClasses.delete(draft.className.trim().toLowerCase());
  const fieldError = !review.ok && !classOnlyReason ? review.reason : searchError;

  return (
    <div
      className={`${classes.engramRow} ${unsaved ? classes.rowUnsaved : ""} ${draft.removed ? classes.engramRemoved : ""}`}
      data-engram-row={row.className}
    >
      <div>
        {catalog !== undefined ? (
          <Text size="xs" c="dimmed" mb={4}>
            {catalog.label}
          </Text>
        ) : null}
        <EngramClassField
          ariaLabel={classLabel}
          value={query}
          disabled={busy || draft.removed}
          error={fieldError}
          usedClassNames={otherClasses}
          onChange={(next) => {
            setQuery(next);
            setSearchError("");
            props.onSearchInvalid?.(false);
          }}
          onConfirm={(className) => {
            setQuery(className);
            setSeenClass(className);
            setSearchError("");
            props.onSearchInvalid?.(false);
            props.onChange({ ...draft, className });
          }}
          onReject={(reason) => {
            setSearchError(reason);
            props.onSearchInvalid?.(true);
          }}
        />
        {showClassOnly ? (
          <Text className={classes.engramFieldHint} size="xs" mt={4}>
            {NAMED_ENGRAM_CLASS_ONLY}
          </Text>
        ) : null}
        {row.duplicate && !draft.removed ? (
          <Text size="xs" c="dimmed" mt={4}>
            This class name is also on another line.
          </Text>
        ) : null}
      </div>
      <div className={classes.engramCenter}>
        <AppSwitch
          aria-label={`Hide ${row.className}`}
          checked={draft.hidden}
          disabled={busy || draft.removed}
          onCheckedChange={(checked) => props.onChange({ ...draft, hidden: checked })}
        />
      </div>
      <NumberInput
        aria-label={`Points cost for ${row.className}`}
        size="xs"
        min={0}
        max={9_999_999}
        allowDecimal={false}
        allowNegative={false}
        hideControls
        placeholder={catalog !== undefined ? String(catalog.points) : undefined}
        value={draft.points === "" ? "" : Number(draft.points)}
        disabled={busy || draft.removed}
        onChange={(value) =>
          props.onChange({ ...draft, points: value === "" || value === undefined ? "" : String(value) })
        }
      />
      <NumberInput
        aria-label={`Level requirement for ${row.className}`}
        size="xs"
        min={0}
        max={9_999_999}
        allowDecimal={false}
        allowNegative={false}
        hideControls
        placeholder={catalog !== undefined ? String(catalog.level) : undefined}
        value={draft.level === "" ? "" : Number(draft.level)}
        disabled={busy || draft.removed}
        onChange={(value) =>
          props.onChange({ ...draft, level: value === "" || value === undefined ? "" : String(value) })
        }
      />
      <div className={classes.engramCenter}>
        <AppSwitch
          aria-label={`Remove prerequisite for ${row.className}`}
          checked={draft.removePrereq}
          disabled={busy || draft.removed}
          onCheckedChange={(checked) => props.onChange({ ...draft, removePrereq: checked })}
        />
      </div>
      <div className={classes.rowActions}>
        <Tooltip
          label={pending ? "Remove this new line" : draft.removed ? "Keep this override" : "Remove this override"}
        >
          <ActionIcon
            variant="subtle"
            color={draft.removed ? "gray" : "attention"}
            disabled={busy}
            aria-label={
              pending
                ? `Remove new engram ${draft.className || row.className}`
                : draft.removed
                  ? `Keep ${row.className} override`
                  : `Remove ${row.className} override`
            }
            onClick={() => props.onChange({ ...draft, removed: !draft.removed })}
          >
            {draft.removed ? <ArrowUUpLeft size={14} /> : <Trash size={14} />}
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}
