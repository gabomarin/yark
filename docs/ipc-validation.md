# IPC runtime validation (#143)

YARK validates renderer→main `ipcMain.handle` arguments with Zod before domain code runs. Schema checks are **not** authorization: existence, ownership, install-dir safety, and stop-in-progress guards still live in services.

## How it works

| Piece | Location |
| --- | --- |
| Shared primitives / limits | [`src/shared/ipc/primitives.ts`](../src/shared/ipc/primitives.ts) |
| Channel arg schemas | [`src/shared/ipc/channel-schemas.ts`](../src/shared/ipc/channel-schemas.ts) |
| `handleValidated` + channel registry | [`src/main/ipc-validate.ts`](../src/main/ipc-validate.ts) |
| Handler registration | [`src/main/ipc-handlers.ts`](../src/main/ipc-handlers.ts) |

`handleValidated(channel, argsSchema, fn)`:

1. Parses the invoke arg list as a Zod **tuple** (arity + types). Optional tails use `ipcTuple` + `.nullish()` so short invokes and `null`/`undefined` work (Zod 3 otherwise requires full tuple length).
2. On failure, returns `IpcResult` `{ ok: false, error: "Invalid IPC arguments (...)" }` (same envelope as domain errors).
3. On success, runs `fn(parsedArgs)`.
4. Records the channel in an in-process set (duplicate registration throws).

Every channel in `IPC` (`src/shared/ipc.ts`) is registered via `handleValidated`. A unit test fails if a new invoke channel is added without a schema entry.

## Coverage

Canonical list: `VALIDATED_IPC_CHANNELS` in `channel-schemas.ts` (must match `Object.values(IPC)`).

Push channels (`push:*`) are main→renderer only and are out of scope for invoke arg validation.

Follow-ups (optional polish, not required to keep the invoke boundary closed): derive TypeScript types from Zod schemas where practical; tighten profile create/update beyond `plainObjectSchema`; warn on INI read when payload exceeds `MAX_INI_FILE_CHARS`.

## How to verify

### Automated

```bash
npm test -- tests/unit/ipc-validation.test.ts
npm run typecheck
```

Expect: full `IPC` ↔ schema registry coverage, arity/nullish cases for `pickPath` / `servers:start`, and `handleValidated` envelope on bad args.

### Manual smoke (optional)

1. Start the app (`npm run dev`).
2. Happy path: create/edit a server, browse install folder in Clone, start/stop, open install folder, run an RCON command, delete a backup (or cancel a cleanup preview).
3. Probe a validated channel with a bad payload (non-string id, relative SteamCMD path). Expect `ok: false` and `Invalid IPC arguments` — domain code must not run.

### Regression notes

- Profile **create/update** still accept a plain object at the IPC layer; domain `validateProfileInput` remains authoritative for field rules.
- `servers:update-patch` still requires a launch/mods patch shape (`isServerProfilePatch`).
- Config-transfer **selection** is gated as a plain object; `assertConfigTransferSelection` remains authoritative.
- Move-install cleanup path binding (#215) is unchanged; Zod only checks types/absolute path shape.

## Agent checklist (new handlers)

1. Add the channel to `IPC` and preload.
2. Add a Zod tuple in [`channel-schemas.ts`](../src/shared/ipc/channel-schemas.ts) and append to `VALIDATED_IPC_CHANNELS`.
3. Register with `handleValidated` only (no raw `ipcMain.handle`). Use `ipcTuple` + `.nullish()` for optional trailing args.
4. Confirm `tests/unit/ipc-validation.test.ts` still passes (contract coverage).
5. Add a unit case for at least one invalid-arg rejection when the schema is non-trivial.
