/**
 * Hosted Resources (#564): experimental loopback-only HTTP host.
 *
 * Security posture (see SECURITY.md):
 * - Bind is fixed to 127.0.0.1 and exclusive; a busy/foreign port fails closed.
 * - GET/HEAD only; opaque high-entropy tokens resolve through SQLite.
 * - Request paths never map to filesystem paths; only the single published
 *   revision of an enabled resource is served.
 * - No CORS, cookies, redirects, proxy behavior, or directory listings.
 * - Bodies and tokens are never logged.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  DEFAULT_HOSTED_RESOURCES_PORT,
  HOSTED_RESOURCES_BIND_HOST,
  HOSTED_RESOURCES_ENABLED_SETTING_KEY,
  HOSTED_RESOURCES_MAX_CONTENT_BYTES,
  HOSTED_RESOURCES_PATH_PREFIX,
  HOSTED_RESOURCES_PORT_SETTING_KEY,
  HOSTED_RESOURCES_TOKEN_BYTES,
  HOSTED_RESOURCES_TOKEN_PATTERN,
  HOSTED_RESOURCE_CONTENT_TYPES,
  formatHostedResourceUrl,
  isHostedResourcesPort,
  parseHostedResourcesEnabled,
  parseHostedResourcesPort,
  serializeHostedResourcesEnabled,
  validateHostedResourceContent,
  type HostedResourceFormat,
} from "@shared/settings/hosted-resources";
import { parseIniTextRows } from "@shared/ini/ini-text";
import type {
  HostedResourceDiagnosticDto,
  HostedResourceDto,
  HostedResourceReferenceDto,
  HostedResourceRevisionDto,
  HostedResourcesDiagnosticsDto,
  HostedResourcesOverviewDto,
  HostedResourcesStateDto,
} from "@shared/ipc";
import type {
  HostedResourcesRepository,
  HostedResourceRow,
  HostedResourceSummaryRow,
} from "@backend/infra/db/hosted-resources-repository";

/** Constant marker so an ownership self-test can prove a loopback answer is ours. */
export const HOSTED_RESOURCES_MARKER_HEADER = "x-yark-hosted-resources";

/** In-memory ownership/served-bytes probe timeout. */
const PROBE_TIMEOUT_MS = 3_000;
const HEADERS_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
const KEEP_ALIVE_TIMEOUT_MS = 5_000;
const MAX_CONNECTIONS = 32;

interface HostedResourcesSettingsStore {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

interface HostedResourceReferenceSource {
  serverId: string;
  serverName: string;
  /** GameUserSettings.ini text scanned for exact YARK URLs. */
  text: string;
}

export interface HostedResourcesServiceDeps {
  repo: HostedResourcesRepository;
  settings: HostedResourcesSettingsStore;
  /** Diagnostics-only; failures are reported as no matches. */
  readReferenceSources: () => HostedResourceReferenceSource[];
}

interface HttpProbeResult {
  status: number;
  marker: boolean;
  body: string;
}

function mintToken(): string {
  return randomBytes(HOSTED_RESOURCES_TOKEN_BYTES).toString("base64url");
}

export function hostedResourceSha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function isLoopbackAddress(address: string | undefined): boolean {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function probeUrl(url: string): Promise<HttpProbeResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: "GET", timeout: PROBE_TIMEOUT_MS }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          marker: res.headers[HOSTED_RESOURCES_MARKER_HEADER] === "1",
          body,
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error("probe timeout")));
    req.on("error", reject);
    req.end();
  });
}

export class HostedResourcesService {
  private server: Server | null = null;
  private boundPort = DEFAULT_HOSTED_RESOURCES_PORT;
  private lastError: string | null = null;
  private readonly requestCounts = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: HostedResourcesServiceDeps) {}

  /** Serializes start/stop/settings mutations (single listener + single DB). */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  getState(): HostedResourcesStateDto {
    const enabled = parseHostedResourcesEnabled(
      this.deps.settings.get(HOSTED_RESOURCES_ENABLED_SETTING_KEY),
    );
    const configuredPort = parseHostedResourcesPort(
      this.deps.settings.get(HOSTED_RESOURCES_PORT_SETTING_KEY),
    );
    return {
      enabled,
      port: this.server !== null ? this.boundPort : configuredPort,
      bindHost: HOSTED_RESOURCES_BIND_HOST,
      listening: this.server !== null,
      error: this.lastError,
    };
  }

  getOverview(): HostedResourcesOverviewDto {
    const state = this.getState();
    return {
      state,
      resources: this.deps.repo
        .listResourceSummaries()
        .map((row) => this.toResourceDto(row, state.port)),
    };
  }

  async applySettings(): Promise<HostedResourcesStateDto> {
    return this.enqueue(async () => {
      const enabled = parseHostedResourcesEnabled(
        this.deps.settings.get(HOSTED_RESOURCES_ENABLED_SETTING_KEY),
      );
      const port = parseHostedResourcesPort(
        this.deps.settings.get(HOSTED_RESOURCES_PORT_SETTING_KEY),
      );
      if (!enabled) {
        await this.stop();
        this.lastError = null;
        return this.getState();
      }
      if (this.server !== null && this.boundPort === port) {
        return this.getState();
      }
      await this.stop();
      await this.listen(port);
      return this.getState();
    });
  }

  async setEnabled(enabled: boolean): Promise<HostedResourcesStateDto> {
    this.deps.settings.set(
      HOSTED_RESOURCES_ENABLED_SETTING_KEY,
      serializeHostedResourcesEnabled(enabled),
    );
    return this.applySettings();
  }

  async setPort(port: number): Promise<HostedResourcesStateDto> {
    if (!isHostedResourcesPort(port)) {
      throw new Error("Port must be between 1024 and 65535.");
    }
    this.deps.settings.set(HOSTED_RESOURCES_PORT_SETTING_KEY, String(port));
    return this.applySettings();
  }

  createResource(input: {
    displayName: string;
    format: HostedResourceFormat;
    content: string;
  }): HostedResourceDto {
    this.assertValidContent(input.format, input.content);
    const now = new Date().toISOString();
    const resource: HostedResourceRow = {
      id: randomUUID(),
      token: mintToken(),
      displayName: input.displayName,
      format: input.format,
      createdAt: now,
      updatedAt: now,
      disabledAt: null,
    };
    this.deps.repo.insertResource(resource);
    this.deps.repo.insertRevision({
      id: randomUUID(),
      resourceId: resource.id,
      sequence: 1,
      content: input.content,
      sha256: hostedResourceSha256(input.content),
      validation: "ok",
      createdAt: now,
      publishedAt: now,
    });
    return this.toResourceDto(this.mustGetSummary(resource.id), this.getState().port);
  }

  publishContent(resourceId: string, content: string): HostedResourceDto {
    const resource = this.mustGetResource(resourceId);
    this.assertValidContent(resource.format, content);
    const now = new Date().toISOString();
    const revisionId = randomUUID();
    this.deps.repo.insertRevision({
      id: revisionId,
      resourceId,
      sequence: this.deps.repo.nextSequence(resourceId),
      content,
      sha256: hostedResourceSha256(content),
      validation: "ok",
      createdAt: now,
      publishedAt: null,
    });
    this.deps.repo.publishRevision(resourceId, revisionId, now);
    return this.toResourceDto(this.mustGetSummary(resourceId), this.getState().port);
  }

  publishRevision(resourceId: string, revisionId: string): HostedResourceDto {
    this.mustGetResource(resourceId);
    const revision = this.deps.repo.getRevision(revisionId);
    if (revision === null || revision.resourceId !== resourceId) {
      throw new Error("Revision not found.");
    }
    this.deps.repo.publishRevision(resourceId, revisionId, new Date().toISOString());
    return this.toResourceDto(this.mustGetSummary(resourceId), this.getState().port);
  }

  renameResource(resourceId: string, displayName: string): HostedResourceDto {
    this.mustGetResource(resourceId);
    this.deps.repo.renameResource(resourceId, displayName, new Date().toISOString());
    return this.toResourceDto(this.mustGetSummary(resourceId), this.getState().port);
  }

  listRevisions(resourceId: string): HostedResourceRevisionDto[] {
    this.mustGetResource(resourceId);
    return this.deps.repo.listRevisions(resourceId).map((revision) => ({
      id: revision.id,
      sequence: revision.sequence,
      sha256: revision.sha256,
      published: revision.publishedAt !== null,
      createdAt: revision.createdAt,
      publishedAt: revision.publishedAt,
      validationMessage: revision.validation === "ok" ? null : revision.validation,
      sizeBytes: Buffer.byteLength(revision.content, "utf8"),
    }));
  }

  setResourceEnabled(resourceId: string, enabled: boolean): HostedResourceDto {
    this.mustGetResource(resourceId);
    const now = new Date().toISOString();
    this.deps.repo.setResourceDisabled(resourceId, enabled ? null : now, now);
    return this.toResourceDto(this.mustGetSummary(resourceId), this.getState().port);
  }

  deleteResource(resourceId: string): void {
    this.requestCounts.delete(resourceId);
    this.deps.repo.deleteResource(resourceId);
  }

  async runDiagnostics(): Promise<HostedResourcesDiagnosticsDto> {
    const ownership = await this.probeOwnership(this.getState());
    // Re-read: a failed ownership probe stops the listener, so the stale state
    // could otherwise report bytes served by the foreign process.
    const state = this.getState();
    const serving = ownership.ok && state.listening;
    const resources: HostedResourceDiagnosticDto[] = [];
    for (const summary of this.deps.repo.listResourceSummaries()) {
      const url = formatHostedResourceUrl(state.port, summary.token);
      let servedSha256: string | null = null;
      if (serving && summary.disabledAt === null && summary.publishedRevisionId !== null) {
        servedSha256 = await this.fetchServedSha256(url);
      }
      resources.push({
        resourceId: summary.id,
        displayName: summary.displayName,
        url,
        enabled: summary.disabledAt === null,
        published: summary.publishedRevisionId !== null,
        declaredSha256: summary.publishedSha256,
        servedSha256,
        servedOk:
          servedSha256 !== null && servedSha256 === summary.publishedSha256,
        requestCount: this.requestCounts.get(summary.id) ?? 0,
      });
    }
    return {
      state,
      ownership,
      resources,
      references: this.scanReferences(state.port),
    };
  }

  /** Boot / settings application. Never throws; failure is surfaced in state. */
  async start(): Promise<void> {
    await this.applySettings();
  }

  async dispose(): Promise<void> {
    await this.enqueue(() => this.stop());
  }

  private async listen(port: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const server = createServer((req, res) => this.handleRequest(req, res));
      server.headersTimeout = HEADERS_TIMEOUT_MS;
      server.requestTimeout = REQUEST_TIMEOUT_MS;
      server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
      server.maxConnections = MAX_CONNECTIONS;
      server.on("clientError", (_error, socket) => {
        if (!socket.writable) {
          socket.destroy();
          return;
        }
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      });

      let bound = false;
      // Single handler: bind failures resolve the awaiting caller; runtime
      // failures after a successful bind fail closed instead of crashing main.
      server.on("error", (error: NodeJS.ErrnoException) => {
        if (bound) {
          if (this.server === server) {
            this.server = null;
            this.lastError = `The listener stopped: ${error.message}`;
            server.close(() => undefined);
          }
          return;
        }
        this.lastError =
          error.code === "EADDRINUSE"
            ? `Port ${port} is already in use; the host is not serving.`
            : `Could not bind ${HOSTED_RESOURCES_BIND_HOST}:${port}: ${error.message}`;
        resolve();
      });

      server.listen(
        { host: HOSTED_RESOURCES_BIND_HOST, port, exclusive: true },
        () => {
          const address = server.address();
          this.boundPort =
            address !== null && typeof address !== "string" ? address.port : port;
          this.server = server;
          this.lastError = null;
          bound = true;
          resolve();
        },
      );
    });
  }

  private async stop(): Promise<void> {
    const server = this.server;
    if (server === null) {
      return;
    }
    this.server = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader(HOSTED_RESOURCES_MARKER_HEADER, "1");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");

    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      this.sendStatus(res, 403);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      this.sendStatus(res, 405);
      return;
    }

    const rawUrl = req.url ?? "";
    const path = rawUrl.split("?")[0] ?? "";
    const token = path.startsWith(HOSTED_RESOURCES_PATH_PREFIX)
      ? path.slice(HOSTED_RESOURCES_PATH_PREFIX.length)
      : "";
    if (!HOSTED_RESOURCES_TOKEN_PATTERN.test(token)) {
      this.sendStatus(res, 404);
      return;
    }

    const resource = this.deps.repo.getResourceByToken(token);
    if (resource === null || resource.disabledAt !== null) {
      this.sendStatus(res, 404);
      return;
    }
    const revision = this.deps.repo.getPublishedRevision(resource.id);
    if (revision === null) {
      this.sendStatus(res, 404);
      return;
    }

    const body = Buffer.from(revision.content, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", HOSTED_RESOURCE_CONTENT_TYPES[resource.format]);
    res.setHeader("Content-Length", String(body.byteLength));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    this.requestCounts.set(resource.id, (this.requestCounts.get(resource.id) ?? 0) + 1);
    res.end(body);
  }

  private sendStatus(res: ServerResponse, status: number): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end();
  }

  private async probeOwnership(
    state: HostedResourcesStateDto,
  ): Promise<{ ok: boolean; message: string }> {
    if (!state.listening) {
      return { ok: false, message: state.error ?? "The host is not listening." };
    }
    try {
      const result = await probeUrl(
        `http://${HOSTED_RESOURCES_BIND_HOST}:${state.port}/`,
      );
      if (!result.marker) {
        await this.enqueue(() => this.stop());
        this.lastError = "Another process owns the port; serving stopped.";
        return { ok: false, message: this.lastError };
      }
      return { ok: true, message: `Served by YARK on ${state.bindHost}.` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Ownership probe failed.",
      };
    }
  }

  private async fetchServedSha256(url: string): Promise<string | null> {
    try {
      const result = await probeUrl(url);
      return result.status === 200 ? hostedResourceSha256(result.body) : null;
    } catch {
      return null;
    }
  }

  private scanReferences(port: number): HostedResourceReferenceDto[] {
    let sources: HostedResourceReferenceSource[];
    try {
      sources = this.deps.readReferenceSources();
    } catch {
      return [];
    }
    const resources = this.deps.repo
      .listResourceSummaries()
      .filter((row) => row.disabledAt === null);
    const references: HostedResourceReferenceDto[] = [];
    for (const source of sources) {
      const rows = parseIniTextRows(source.text);
      for (const resource of resources) {
        const url = formatHostedResourceUrl(port, resource.token);
        for (const row of rows) {
          if (row.value.includes(url)) {
            references.push({
              resourceId: resource.id,
              serverId: source.serverId,
              serverName: source.serverName,
              key: row.key,
              url,
            });
          }
        }
      }
    }
    return references;
  }

  private assertValidContent(format: HostedResourceFormat, content: string): void {
    const validation = validateHostedResourceContent(format, content);
    if (!validation.ok) {
      throw new Error(validation.message ?? `Content must be <= ${HOSTED_RESOURCES_MAX_CONTENT_BYTES} bytes.`);
    }
  }

  private mustGetResource(id: string): HostedResourceRow {
    const resource = this.deps.repo.getResource(id);
    if (resource === null) {
      throw new Error("Resource not found.");
    }
    return resource;
  }

  private mustGetSummary(id: string): HostedResourceSummaryRow {
    const summary = this.deps.repo
      .listResourceSummaries()
      .find((row) => row.id === id);
    if (summary === undefined) {
      throw new Error("Resource not found.");
    }
    return summary;
  }

  private toResourceDto(
    row: HostedResourceSummaryRow,
    port: number,
  ): HostedResourceDto {
    return {
      id: row.id,
      displayName: row.displayName,
      format: row.format,
      url: formatHostedResourceUrl(port, row.token),
      enabled: row.disabledAt === null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      revisionCount: row.revisionCount,
      publishedRevisionId: row.publishedRevisionId,
      publishedSequence: row.publishedSequence,
      publishedSha256: row.publishedSha256,
      publishedSizeBytes: row.publishedSizeBytes,
    };
  }
}
