import { sanitizeDiagnosticText } from "@shared/credential-redaction";
import {
  RUNTIME_LOG_SOURCES,
  appendRuntimeLogRing,
  formatRuntimeLogLine,
  runtimeLogPartialKey,
  splitRuntimeLogChunk,
  type RuntimeLogSource,
} from "./process-readiness";

export function appendProcessRuntimeLog(
  runtimeLogs: Map<string, string[]>,
  knownSecrets: () => readonly string[],
  serverId: string,
  source: string,
  message: string,
): void {
  const sanitized = sanitizeDiagnosticText(message, knownSecrets());
  if (message.trim().length > 0 && sanitized.trim().length === 0) {
    return;
  }
  const line = sanitized.trim();
  if (line.length === 0) {
    return;
  }

  const list = runtimeLogs.get(serverId) ?? [];
  runtimeLogs.set(
    serverId,
    appendRuntimeLogRing(
      list,
      formatRuntimeLogLine(new Date().toISOString(), source, line),
    ),
  );
}

export function flushProcessRuntimePartials(
  runtimePartials: Map<string, string>,
  append: (serverId: string, source: string, message: string) => void,
  serverId: string,
): void {
  for (const source of RUNTIME_LOG_SOURCES) {
    const key = runtimeLogPartialKey(serverId, source);
    const pending = runtimePartials.get(key);
    runtimePartials.delete(key);
    if (pending !== undefined && pending.trim().length > 0) {
      append(serverId, source, pending);
    }
  }
}

export function clearProcessRuntimePartials(
  runtimePartials: Map<string, string>,
  serverId: string,
): void {
  for (const source of RUNTIME_LOG_SOURCES) {
    runtimePartials.delete(runtimeLogPartialKey(serverId, source));
  }
}

export function captureProcessRuntimeChunk(
  runtimePartials: Map<string, string>,
  append: (serverId: string, source: string, message: string) => void,
  serverId: string,
  source: RuntimeLogSource,
  chunk: string,
  onCompleteLogLines?: () => void,
): void {
  const key = runtimeLogPartialKey(serverId, source);
  const previous = runtimePartials.get(key) ?? "";
  const { completeLines, remainder } = splitRuntimeLogChunk(previous, chunk);
  runtimePartials.set(key, remainder);
  for (const line of completeLines) {
    append(serverId, source, line);
  }
  if (source === "log" && completeLines.length > 0) {
    onCompleteLogLines?.();
  }
}
