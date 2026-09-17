import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { HostedResourcesRepository } from "@backend/infra/db/hosted-resources-repository";
import {
  HOSTED_RESOURCES_MARKER_HEADER,
  HostedResourcesService,
  hostedResourceSha256,
  isLoopbackAddress,
} from "@backend/domains/hosted-resources/hosted-resources-service";
import {
  HOSTED_RESOURCES_ENABLED_SETTING_KEY,
  HOSTED_RESOURCES_MAX_CONTENT_BYTES,
  HOSTED_RESOURCES_PORT_SETTING_KEY,
  formatHostedResourceUrl,
  isHostedResourcesPort,
  parseHostedResourcesPort,
  validateHostedResourceContent,
} from "@shared/settings/hosted-resources";

const openDbs: DatabaseSync[] = [];
const openServices: HostedResourcesService[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const service of openServices.splice(0)) {
    await service.dispose();
  }
  for (const db of openDbs.splice(0)) {
    db.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Harness {
  db: DatabaseSync;
  repo: HostedResourcesRepository;
  service: HostedResourcesService;
  settings: Map<string, string>;
}

function createHarness(
  readReferenceSources: () => { serverId: string; serverName: string; text: string }[] = () => [],
): Harness {
  const db = openDatabase(":memory:");
  openDbs.push(db);
  const repo = new HostedResourcesRepository(db);
  const settings = new Map<string, string>();
  const service = new HostedResourcesService({
    repo,
    settings: {
      get: (key) => settings.get(key) ?? null,
      set: (key, value) => {
        if (value === null) {
          settings.delete(key);
        } else {
          settings.set(key, value);
        }
      },
    },
    readReferenceSources,
  });
  openServices.push(service);
  return { db, repo, service, settings };
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => {
    server.listen({ host: "127.0.0.1", port: 0 }, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

interface HttpResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

function send(
  port: number,
  path: string,
  method = "GET",
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      `http://127.0.0.1:${port}${path}`,
      { method },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function startServing(harness: Harness): Promise<number> {
  const port = await reserveLoopbackPort();
  harness.settings.set(HOSTED_RESOURCES_PORT_SETTING_KEY, String(port));
  const state = await harness.service.setEnabled(true);
  expect(state.listening).toBe(true);
  expect(state.error).toBeNull();
  return state.port;
}

describe("hosted resources settings", () => {
  it("clamps invalid ports to the default", () => {
    expect(parseHostedResourcesPort(null)).toBe(8935);
    expect(parseHostedResourcesPort("0")).toBe(8935);
    expect(parseHostedResourcesPort("70000")).toBe(8935);
    expect(parseHostedResourcesPort("9000")).toBe(9000);
    expect(isHostedResourcesPort(1024)).toBe(true);
    expect(isHostedResourcesPort(65536)).toBe(false);
  });

  it("validates content shape and size before publishing", () => {
    expect(validateHostedResourceContent("json", "{}").ok).toBe(true);
    expect(validateHostedResourceContent("json", "{").ok).toBe(false);
    expect(validateHostedResourceContent("text", "hello").ok).toBe(true);
    expect(validateHostedResourceContent("text", "").ok).toBe(false);
    expect(validateHostedResourceContent("ini", "[ServerSettings]\nA=B").ok).toBe(true);
    expect(validateHostedResourceContent("ini", "not ini at all").ok).toBe(false);
    expect(
      validateHostedResourceContent("text", "x".repeat(HOSTED_RESOURCES_MAX_CONTENT_BYTES)).ok,
    ).toBe(true);
    expect(
      validateHostedResourceContent("text", "x".repeat(HOSTED_RESOURCES_MAX_CONTENT_BYTES + 1)).ok,
    ).toBe(false);
  });

  it("treats only loopback addresses as local", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("192.168.1.20")).toBe(false);
    expect(isLoopbackAddress("0.0.0.0")).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});

describe("hosted resources repository", () => {
  it("migrates a file-backed database and lists resource summaries", () => {
    const dir = mkdtempSync(join(tmpdir(), "yark-hosted-"));
    tempDirs.push(dir);
    const db = openDatabase(join(dir, "profile.db"), { takeSnapshots: false });
    openDbs.push(db);
    const repo = new HostedResourcesRepository(db);
    expect(repo.listResourceSummaries()).toEqual([]);
  });

  it("swaps the published revision atomically and never serves drafts", () => {
    const db = openDatabase(":memory:");
    openDbs.push(db);
    const repo = new HostedResourcesRepository(db);
    const now = new Date().toISOString();
    repo.insertResource({
      id: "r1",
      token: "t".repeat(43),
      displayName: "Admins",
      format: "text",
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
    });
    repo.insertRevision({
      id: "rev1",
      resourceId: "r1",
      sequence: 1,
      content: "v1",
      sha256: hostedResourceSha256("v1"),
      validation: "ok",
      createdAt: now,
      publishedAt: now,
    });
    repo.insertRevision({
      id: "rev2-draft",
      resourceId: "r1",
      sequence: 2,
      content: "draft",
      sha256: hostedResourceSha256("draft"),
      validation: "ok",
      createdAt: now,
      publishedAt: null,
    });

    expect(repo.getPublishedRevision("r1")?.content).toBe("v1");

    repo.publishRevision("r1", "rev2-draft", now);
    expect(repo.getPublishedRevision("r1")?.content).toBe("draft");
    const published = repo.listRevisions("r1").filter((row) => row.publishedAt !== null);
    expect(published).toHaveLength(1);
  });
});

describe("hosted resources HTTP host", () => {
  it("serves the published revision with hardened headers", async () => {
    const harness = createHarness();
    const port = await startServing(harness);
    const resource = harness.service.createResource({
      displayName: "Admins",
      format: "text",
      content: "EOSID1\nEOSID2",
    });

    const response = await send(port, `/r/${resource.url.split("/r/")[1]}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers[HOSTED_RESOURCES_MARKER_HEADER]).toBe("1");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.body).toBe("EOSID1\nEOSID2");
  });

  it("serves JSON with a JSON content type", async () => {
    const harness = createHarness();
    const port = await startServing(harness);
    const resource = harness.service.createResource({
      displayName: "Config",
      format: "json",
      content: '{"a":1}',
    });

    const response = await send(port, `/r/${resource.url.split("/r/")[1]}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
  });

  it("answers HEAD without a body and rejects other methods", async () => {
    const harness = createHarness();
    const port = await startServing(harness);
    const resource = harness.service.createResource({
      displayName: "Admins",
      format: "text",
      content: "EOSID1",
    });
    const path = `/r/${resource.url.split("/r/")[1]}`;

    const head = await send(port, path, "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");

    const post = await send(port, path, "POST");
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe("GET, HEAD");
  });

  it("rejects unknown tokens, traversal, and extra path segments", async () => {
    const harness = createHarness();
    const port = await startServing(harness);
    const resource = harness.service.createResource({
      displayName: "Admins",
      format: "text",
      content: "EOSID1",
    });
    const token = resource.url.split("/r/")[1]!;

    expect((await send(port, `/r/${"a".repeat(43)}`)).status).toBe(404);
    expect((await send(port, "/r/short")).status).toBe(404);
    expect((await send(port, `/r/${token}/extra`)).status).toBe(404);
    expect((await send(port, "/r/..%2f..%2fetc%2fpasswd")).status).toBe(404);
    expect((await send(port, "/")).status).toBe(404);
  });

  it("stops serving immediately after revocation", async () => {
    const harness = createHarness();
    const port = await startServing(harness);
    const resource = harness.service.createResource({
      displayName: "Admins",
      format: "text",
      content: "EOSID1",
    });
    const path = `/r/${resource.url.split("/r/")[1]}`;
    expect((await send(port, path)).status).toBe(200);

    harness.service.revokeResource(resource.id);
    expect((await send(port, path)).status).toBe(404);
  });

  it("swaps served bytes atomically on publish", async () => {
    const harness = createHarness();
    const port = await startServing(harness);
    const resource = harness.service.createResource({
      displayName: "Admins",
      format: "text",
      content: "v1",
    });
    const path = `/r/${resource.url.split("/r/")[1]}`;

    harness.service.publishContent(resource.id, "v2");
    const response = await send(port, path);
    expect(response.body).toBe("v2");
    expect(response.headers["content-length"]).toBe("2");

    const overview = harness.service.getOverview();
    expect(overview.resources[0]?.publishedSizeBytes).toBe(2);
  });

  it("fails closed when the port is owned by another process", async () => {
    const port = await reserveLoopbackPort();
    const blocker = createNetServer();
    await new Promise<void>((resolve) => {
      blocker.listen({ host: "127.0.0.1", port }, () => resolve());
    });
    const harness = createHarness();
    harness.settings.set(HOSTED_RESOURCES_PORT_SETTING_KEY, String(port));

    const state = await harness.service.setEnabled(true);
    expect(state.listening).toBe(false);
    expect(state.error).toContain("in use");

    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  });

  it("reports ownership and served bytes in diagnostics", async () => {
    const harness = createHarness();
    const port = await startServing(harness);
    const resource = harness.service.createResource({
      displayName: "Admins",
      format: "text",
      content: "EOSID1",
    });

    const diagnostics = await harness.service.runDiagnostics();
    expect(diagnostics.state.listening).toBe(true);
    expect(diagnostics.ownership.ok).toBe(true);
    expect(diagnostics.resources).toHaveLength(1);
    expect(diagnostics.resources[0]?.servedOk).toBe(true);
    expect(diagnostics.resources[0]?.declaredSha256).toBe(
      hostedResourceSha256("EOSID1"),
    );
    expect(resource.url).toBe(formatHostedResourceUrl(port, resource.url.split("/r/")[1]!));
  });

  it("discovers exact URLs referenced by managed server INIs", async () => {
    const tokenHolder: { url: string } = { url: "" };
    const harness = createHarness(() => [
      {
        serverId: "s1",
        serverName: "Island",
        text: `[ServerSettings]\nAdminListURL=${tokenHolder.url}\n`,
      },
    ]);
    await startServing(harness);
    const resource = harness.service.createResource({
      displayName: "Admins",
      format: "text",
      content: "EOSID1",
    });
    tokenHolder.url = resource.url;

    const diagnostics = await harness.service.runDiagnostics();
    expect(diagnostics.references).toEqual([
      {
        resourceId: resource.id,
        serverId: "s1",
        serverName: "Island",
        key: "AdminListURL",
        url: resource.url,
      },
    ]);
  });

  it("does not serve anything while disabled", async () => {
    const harness = createHarness();
    harness.settings.set(HOSTED_RESOURCES_ENABLED_SETTING_KEY, "false");
    const state = await harness.service.applySettings();
    expect(state.enabled).toBe(false);
    expect(state.listening).toBe(false);
  });
});
