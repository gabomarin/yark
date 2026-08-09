import { useEffect, useRef, useState } from "react";
import type { ServerProfile } from "@shared/types";
import {
  findLaunchArgConflicts,
  normalizeStructuredLaunchArgs,
  type StructuredLaunchArgs,
} from "@shared/structured-launch-options";
import {
  joinRawExtraArgs,
  parseRawExtraArgs,
  toLaunchProfileInput,
} from "./serverLaunchModel";

const VALUE_PERSIST_DEBOUNCE_MS = 400;

interface PersistJob {
  structured: StructuredLaunchArgs;
  extraArgs: string[];
}

interface DraftBaseline {
  structured: StructuredLaunchArgs;
  rawText: string;
}

function sameStructured(
  left: StructuredLaunchArgs,
  right: StructuredLaunchArgs,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Local Launch draft + serialized/coalesced profile updates. */
export function useServerLaunchPersist(
  server: ServerProfile,
  onServerUpdated: () => void,
): {
  structured: StructuredLaunchArgs;
  rawText: string;
  setRawText: (value: string) => void;
  extraArgs: string[];
  saving: boolean;
  error: string | null;
  setEnabled: (
    id: string,
    enabled: boolean,
    defaultValue?: string,
  ) => Promise<void>;
  setValue: (id: string, value: string) => void;
  persistExtraArgsFromRaw: () => Promise<void>;
} {
  const initialStructured = normalizeStructuredLaunchArgs(
    server.structuredLaunchArgs,
  );
  const initialRaw = joinRawExtraArgs(server.extraArgs);
  const [structured, setStructured] = useState<StructuredLaunchArgs>(
    () => initialStructured,
  );
  const [rawText, setRawText] = useState(() => initialRaw);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const structuredRef = useRef(structured);
  const rawTextRef = useRef(rawText);
  const extraArgsRef = useRef<string[]>(parseRawExtraArgs(rawText));
  const valuePersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedPersist = useRef<PersistJob | null>(null);
  const persistChain = useRef(Promise.resolve());
  const persistWaiters = useRef<Array<(ok: boolean) => void>>([]);
  const serverIdRef = useRef(server.id);
  const onServerUpdatedRef = useRef(onServerUpdated);
  const serverProfileRef = useRef(server);
  const baselineRef = useRef<DraftBaseline>({
    structured: initialStructured,
    rawText: initialRaw,
  });
  const persistGenerationRef = useRef(0);

  serverIdRef.current = server.id;
  onServerUpdatedRef.current = onServerUpdated;
  serverProfileRef.current = server;
  rawTextRef.current = rawText;

  const extraArgs = parseRawExtraArgs(rawText);
  extraArgsRef.current = extraArgs;

  useEffect(() => {
    structuredRef.current = structured;
  }, [structured]);

  function isDraftDirty(): boolean {
    const baseline = baselineRef.current;
    return (
      rawTextRef.current !== baseline.rawText
      || !sameStructured(structuredRef.current, baseline.structured)
    );
  }

  function applyServerDraft(nextServer: ServerProfile): void {
    const nextStructured = normalizeStructuredLaunchArgs(
      nextServer.structuredLaunchArgs,
    );
    const nextRaw = joinRawExtraArgs(nextServer.extraArgs);
    structuredRef.current = nextStructured;
    rawTextRef.current = nextRaw;
    extraArgsRef.current = parseRawExtraArgs(nextRaw);
    baselineRef.current = { structured: nextStructured, rawText: nextRaw };
    setStructured(nextStructured);
    setRawText(nextRaw);
    setError(null);
  }

  useEffect(() => {
    applyServerDraft(server);
    // Reset local draft when switching profiles only.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: server.id
  }, [server.id]);

  useEffect(() => {
    // After a successful save, parent refresh bumps updatedAt. Apply remote
    // changes only when the local draft is idle/clean so keystrokes are not wiped.
    if (saving) return;
    if (valuePersistTimer.current !== null) return;
    if (queuedPersist.current !== null) return;
    if (isDraftDirty()) return;
    applyServerDraft(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: updatedAt sync
  }, [server.updatedAt]);

  useEffect(() => {
    return () => {
      if (valuePersistTimer.current !== null) {
        clearTimeout(valuePersistTimer.current);
      }
    };
  }, []);

  async function persistOnce(job: PersistJob): Promise<boolean> {
    const conflictsNow = findLaunchArgConflicts({
      structured: job.structured,
      extraArgs: job.extraArgs,
    });
    if (conflictsNow.length > 0) {
      setError(conflictsNow.map((c) => c.message).join(" "));
      return false;
    }
    const generation = ++persistGenerationRef.current;
    const targetServerId = serverIdRef.current;
    setSaving(true);
    setError(null);
    try {
      const result = await window.api.updateServer(
        targetServerId,
        toLaunchProfileInput(
          serverProfileRef.current,
          job.structured,
          job.extraArgs,
        ),
      );
      if (generation !== persistGenerationRef.current) {
        return false;
      }
      if (serverIdRef.current !== targetServerId) {
        return false;
      }
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      baselineRef.current = {
        structured: job.structured,
        rawText: joinRawExtraArgs(job.extraArgs),
      };
      onServerUpdatedRef.current();
      return true;
    } finally {
      if (
        generation === persistGenerationRef.current
        && serverIdRef.current === targetServerId
      ) {
        setSaving(false);
      }
    }
  }

  async function drainPersistQueue(): Promise<void> {
    let ok = true;
    while (queuedPersist.current !== null) {
      const job = queuedPersist.current;
      queuedPersist.current = null;
      ok = await persistOnce(job);
    }
    const waiters = persistWaiters.current.splice(0);
    for (const resolve of waiters) resolve(ok);
  }

  function schedulePersist(
    structuredSnapshot?: StructuredLaunchArgs,
    extraSnapshot?: string[],
  ): Promise<boolean> {
    queuedPersist.current = {
      structured: structuredSnapshot ?? structuredRef.current,
      extraArgs: extraSnapshot ?? [...extraArgsRef.current],
    };
    return new Promise<boolean>((resolve) => {
      persistWaiters.current.push(resolve);
      persistChain.current = persistChain.current
        .then(drainPersistQueue)
        .catch(() => {
          const waiters = persistWaiters.current.splice(0);
          for (const waiter of waiters) waiter(false);
        });
    });
  }

  async function setEnabled(
    id: string,
    enabled: boolean,
    defaultValue?: string,
  ): Promise<void> {
    if (valuePersistTimer.current !== null) {
      clearTimeout(valuePersistTimer.current);
      valuePersistTimer.current = null;
    }
    const prev = structuredRef.current;
    const next = {
      ...prev,
      [id]: {
        enabled,
        value: prev[id]?.value ?? defaultValue ?? "",
      },
    };
    structuredRef.current = next;
    setStructured(next);
    const draftIssues = findLaunchArgConflicts({
      structured: next,
      extraArgs: extraArgsRef.current,
    });
    if (draftIssues.length > 0) {
      setError(draftIssues.map((c) => c.message).join(" "));
      return;
    }
    const ok = await schedulePersist(next, [...extraArgsRef.current]);
    if (!ok && structuredRef.current === next) {
      structuredRef.current = prev;
      setStructured(prev);
    }
  }

  function setValue(id: string, value: string): void {
    const prev = structuredRef.current;
    const next = {
      ...prev,
      [id]: { enabled: prev[id]?.enabled === true, value },
    };
    structuredRef.current = next;
    setStructured(next);
    if (valuePersistTimer.current !== null) {
      clearTimeout(valuePersistTimer.current);
    }
    valuePersistTimer.current = setTimeout(() => {
      valuePersistTimer.current = null;
      const snapshot = structuredRef.current;
      const draftIssues = findLaunchArgConflicts({
        structured: snapshot,
        extraArgs: extraArgsRef.current,
      });
      if (draftIssues.length > 0) {
        setError(draftIssues.map((c) => c.message).join(" "));
        return;
      }
      void schedulePersist(snapshot, [...extraArgsRef.current]);
    }, VALUE_PERSIST_DEBOUNCE_MS);
  }

  async function persistExtraArgsFromRaw(): Promise<void> {
    const nextExtra = parseRawExtraArgs(rawTextRef.current);
    extraArgsRef.current = nextExtra;
    const prev = serverProfileRef.current.extraArgs;
    const ok = await schedulePersist(structuredRef.current, nextExtra);
    if (!ok) {
      const rolledBack = joinRawExtraArgs(prev);
      rawTextRef.current = rolledBack;
      setRawText(rolledBack);
      extraArgsRef.current = [...prev];
    }
  }

  return {
    structured,
    rawText,
    setRawText,
    extraArgs,
    saving,
    error,
    setEnabled,
    setValue,
    persistExtraArgsFromRaw,
  };
}
