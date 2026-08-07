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
  const [structured, setStructured] = useState<StructuredLaunchArgs>(() =>
    normalizeStructuredLaunchArgs(server.structuredLaunchArgs),
  );
  const [rawText, setRawText] = useState(() =>
    joinRawExtraArgs(server.extraArgs),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const structuredRef = useRef(structured);
  const extraArgsRef = useRef<string[]>(parseRawExtraArgs(rawText));
  const valuePersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedPersist = useRef<PersistJob | null>(null);
  const persistChain = useRef(Promise.resolve());
  const persistWaiters = useRef<Array<(ok: boolean) => void>>([]);
  const serverIdRef = useRef(server.id);
  const onServerUpdatedRef = useRef(onServerUpdated);
  const serverProfileRef = useRef(server);

  serverIdRef.current = server.id;
  onServerUpdatedRef.current = onServerUpdated;
  serverProfileRef.current = server;

  const extraArgs = parseRawExtraArgs(rawText);
  extraArgsRef.current = extraArgs;

  useEffect(() => {
    structuredRef.current = structured;
  }, [structured]);

  useEffect(() => {
    setStructured(normalizeStructuredLaunchArgs(server.structuredLaunchArgs));
    setRawText(joinRawExtraArgs(server.extraArgs));
    setError(null);
  }, [server.id, server.updatedAt]);

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
    setSaving(true);
    setError(null);
    try {
      const result = await window.api.updateServer(
        serverIdRef.current,
        toLaunchProfileInput(
          serverProfileRef.current,
          job.structured,
          job.extraArgs,
        ),
      );
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      onServerUpdatedRef.current();
      return true;
    } finally {
      setSaving(false);
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
    setStructured((prev) => {
      const next = {
        ...prev,
        [id]: { enabled: prev[id]?.enabled === true, value },
      };
      structuredRef.current = next;
      return next;
    });
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
    const nextExtra = parseRawExtraArgs(rawText);
    extraArgsRef.current = nextExtra;
    const prev = server.extraArgs;
    const ok = await schedulePersist(structuredRef.current, nextExtra);
    if (!ok) {
      setRawText(joinRawExtraArgs(prev));
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
