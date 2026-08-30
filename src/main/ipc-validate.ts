/**
 * Runtime IPC argument validation (#143).
 * Schema validation is not authorization — domain guards still apply.
 */

import { ipcMain } from "electron";
import type { z } from "zod";
import type { IpcResult } from "../shared/ipc";
import { formatZodError } from "../shared/ipc/primitives";
import { sanitizeDiagnosticText } from "../shared/credential-redaction";

const validatedChannels = new Set<string>();

let ipcKnownSecrets: () => readonly string[] = () => [];

/** Wire live profile passwords so IPC `ok: false` can redact bare secrets. */
export function setIpcDiagnosticKnownSecrets(
  provider: () => readonly string[],
): void {
  ipcKnownSecrets = provider;
}

/** Reset between unit tests only. */
export function resetValidatedIpcChannelsForTests(): void {
  validatedChannels.clear();
  ipcKnownSecrets = () => [];
}

function wrapIpcResult<T>(fn: () => T | Promise<T>): Promise<IpcResult<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((err: unknown): IpcResult<T> => ({
      ok: false,
      error: sanitizeDiagnosticText(
        err instanceof Error ? err.message : String(err),
        ipcKnownSecrets(),
      ),
    }));
}

/**
 * Register an ipcMain.handle that Zod-parses invoke args before the domain runs.
 * `argsSchema` should be a `z.tuple([...])` matching invoke arity.
 */
export function handleValidated<TSchema extends z.ZodTypeAny, TResult>(
  channel: string,
  argsSchema: TSchema,
  fn: (args: z.infer<TSchema>) => TResult | Promise<TResult>,
): void {
  if (validatedChannels.has(channel)) {
    throw new Error(`IPC channel already registered with handleValidated: ${channel}`);
  }
  validatedChannels.add(channel);

  ipcMain.handle(channel, (_event, ...raw: unknown[]) =>
    wrapIpcResult(async () => {
      const parsed = argsSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(formatZodError(parsed.error));
      }
      return fn(parsed.data as z.infer<TSchema>);
    }),
  );
}
