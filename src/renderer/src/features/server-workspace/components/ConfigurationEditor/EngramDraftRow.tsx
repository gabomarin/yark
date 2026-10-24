import { useState, type ReactElement } from "react";
import { NumberInput, Text } from "@mantine/core";
import { lookupAsaEngram } from "@shared/asa/asa-engram-catalog";
import {
  NAMED_ENGRAM_CLASS_ONLY,
  pendingEngramLacksEffect,
  type NamedEngramDraft,
} from "@shared/ini/engram-named-entries";
import { AppSwitch } from "@ui/AppSwitch/AppSwitch";
import classes from "./ConfigurationEditor.module.css";
import { EngramClassField } from "./EngramClassField";

interface Props {
  busy: boolean;
  usedClassNames: ReadonlySet<string>;
  onAdd: (draft: NamedEngramDraft, listEngram: boolean) => void;
  onInvalidChange?: (invalid: boolean) => void;
}

export function EngramDraftRow(props: Props): ReactElement {
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [hidden, setHidden] = useState(false);
  const [points, setPoints] = useState("");
  const [level, setLevel] = useState("");
  const [removePrereq, setRemovePrereq] = useState(false);
  const catalog = committed === null ? undefined : lookupAsaEngram(committed);
  const ready = committed !== null;
  const reportInvalid = (nextReason: string, nextCommitted: string | null): void => {
    props.onInvalidChange?.(nextReason.length > 0 || nextCommitted !== null);
  };

  const reset = (): void => {
    setQuery("");
    setCommitted(null);
    setReason("");
    setHidden(false);
    setPoints("");
    setLevel("");
    setRemovePrereq(false);
    reportInvalid("", null);
  };

  const promote = (draft: NamedEngramDraft): void => {
    if (pendingEngramLacksEffect(draft, false)) return;
    props.onAdd(draft, false);
    reset();
  };

  const accept = (className: string): void => {
    setCommitted(className);
    setQuery(className);
    setReason("");
    reportInvalid("", className);
  };

  const draftWith = (patch: Partial<NamedEngramDraft>): void => {
    if (committed === null) return;
    promote({
      className: committed,
      hidden,
      points,
      level,
      removePrereq,
      removed: false,
      ...patch,
    });
  };

  return (
    <div className={classes.engramRow}>
      <div>
        {catalog !== undefined ? (
          <Text size="xs" c="dimmed" mb={4}>
            {catalog.label}
          </Text>
        ) : null}
        <EngramClassField
          ariaLabel="New engram class name"
          value={query}
          disabled={props.busy}
          error={reason}
          usedClassNames={props.usedClassNames}
          onChange={(next) => {
            setQuery(next);
            setCommitted(null);
            setReason("");
            reportInvalid("", null);
          }}
          onConfirm={accept}
          onReject={(next) => {
            setReason(next);
            setCommitted(null);
            reportInvalid(next, null);
          }}
        />
        {ready ? (
          <Text className={classes.engramFieldHint} size="xs" mt={4}>
            {NAMED_ENGRAM_CLASS_ONLY}
          </Text>
        ) : null}
      </div>
      <div className={classes.engramCenter}>
        <AppSwitch
          aria-label="Hide new engram"
          checked={hidden}
          disabled={!ready || props.busy}
          onCheckedChange={(checked) => {
            setHidden(checked);
            if (checked) draftWith({ hidden: true });
          }}
        />
      </div>
      <NumberInput
        aria-label="Points cost for new engram"
        size="xs"
        min={0}
        max={9_999_999}
        allowDecimal={false}
        allowNegative={false}
        hideControls
        placeholder={catalog !== undefined ? String(catalog.points) : undefined}
        value={points === "" ? "" : Number(points)}
        disabled={!ready || props.busy}
        onChange={(value) => {
          const next = value === "" || value === undefined ? "" : String(value);
          setPoints(next);
          if (next.trim() !== "") draftWith({ points: next });
        }}
      />
      <NumberInput
        aria-label="Level requirement for new engram"
        size="xs"
        min={0}
        max={9_999_999}
        allowDecimal={false}
        allowNegative={false}
        hideControls
        placeholder={catalog !== undefined ? String(catalog.level) : undefined}
        value={level === "" ? "" : Number(level)}
        disabled={!ready || props.busy}
        onChange={(value) => {
          const next = value === "" || value === undefined ? "" : String(value);
          setLevel(next);
          if (next.trim() !== "") draftWith({ level: next });
        }}
      />
      <div className={classes.engramCenter}>
        <AppSwitch
          aria-label="Remove prerequisite for new engram"
          checked={removePrereq}
          disabled={!ready || props.busy}
          onCheckedChange={(checked) => {
            setRemovePrereq(checked);
            if (checked) draftWith({ removePrereq: true });
          }}
        />
      </div>
      <span />
    </div>
  );
}
