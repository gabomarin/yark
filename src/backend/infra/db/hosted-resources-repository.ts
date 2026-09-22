import type { DatabaseSync } from "node:sqlite";
import {
  isHostedResourceKind,
  type HostedResourceFormat,
  type HostedResourceKind,
} from "@shared/settings/hosted-resources";

export interface HostedResourceRow {
  id: string;
  token: string;
  displayName: string;
  format: HostedResourceFormat;
  /** Typed ASA consumer (#577); null for a manual, undeclared resource. */
  kind: HostedResourceKind | null;
  createdAt: string;
  updatedAt: string;
  /** Null while enabled; set to the disable timestamp while disabled. */
  disabledAt: string | null;
  notes: string;
  tags: string[];
}

export interface HostedResourceRevisionRow {
  id: string;
  resourceId: string;
  sequence: number;
  content: string;
  sha256: string;
  validation: string;
  createdAt: string;
  publishedAt: string | null;
}

/** Resource row plus published-revision metadata, without loading content. */
export interface HostedResourceSummaryRow extends HostedResourceRow {
  revisionCount: number;
  publishedRevisionId: string | null;
  publishedSequence: number | null;
  publishedSha256: string | null;
  /** UTF-8 byte length of the published revision body, or null when unpublished. */
  publishedSizeBytes: number | null;
}

interface ResourceDbRow {
  id: string;
  token: string;
  display_name: string;
  format: string;
  kind: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
  notes: string;
  tags_json: string;
}

interface SummaryDbRow extends ResourceDbRow {
  revision_count: number;
  published_revision_id: string | null;
  published_sequence: number | null;
  published_sha256: string | null;
  published_size_bytes: number | null;
}

interface RevisionDbRow {
  id: string;
  resource_id: string;
  sequence: number;
  content: string;
  sha256: string;
  validation: string;
  created_at: string;
  published_at: string | null;
}

function toResource(row: ResourceDbRow): HostedResourceRow {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags_json);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((tag): tag is string => typeof tag === "string");
    }
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    token: row.token,
    displayName: row.display_name,
    format: row.format as HostedResourceFormat,
    // Lenient read: an unknown stored value degrades to untyped instead of failing a list.
    kind: isHostedResourceKind(row.kind) ? row.kind : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at,
    notes: row.notes,
    tags,
  };
}

function toRevision(row: RevisionDbRow): HostedResourceRevisionRow {
  return {
    id: row.id,
    resourceId: row.resource_id,
    sequence: row.sequence,
    content: row.content,
    sha256: row.sha256,
    validation: row.validation,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

/**
 * Hosted Resources persistence (#564). Opaque tokens are the only request-path
 * lookup; content is served solely from the single published revision.
 */
export class HostedResourcesRepository {
  constructor(private readonly db: DatabaseSync) {}

  listResourceSummaries(): HostedResourceSummaryRow[] {
    const rows = this.db
      .prepare(
        `SELECT r.*,
           (SELECT COUNT(*) FROM hosted_resource_revisions v WHERE v.resource_id = r.id)
             AS revision_count,
           (SELECT v.id FROM hosted_resource_revisions v
             WHERE v.resource_id = r.id AND v.published_at IS NOT NULL)
             AS published_revision_id,
           (SELECT v.sequence FROM hosted_resource_revisions v
             WHERE v.resource_id = r.id AND v.published_at IS NOT NULL)
             AS published_sequence,
           (SELECT v.sha256 FROM hosted_resource_revisions v
             WHERE v.resource_id = r.id AND v.published_at IS NOT NULL)
             AS published_sha256,
           (SELECT LENGTH(CAST(v.content AS BLOB)) FROM hosted_resource_revisions v
             WHERE v.resource_id = r.id AND v.published_at IS NOT NULL)
             AS published_size_bytes
         FROM hosted_resources r
         ORDER BY r.created_at ASC, r.id ASC`,
      )
      .all() as unknown as SummaryDbRow[];
    return rows.map((row) => ({
      ...toResource(row),
      revisionCount: row.revision_count,
      publishedRevisionId: row.published_revision_id,
      publishedSequence: row.published_sequence,
      publishedSha256: row.published_sha256,
      publishedSizeBytes: row.published_size_bytes,
    }));
  }

  getResource(id: string): HostedResourceRow | null {
    const row = this.db.prepare("SELECT * FROM hosted_resources WHERE id = ?").get(id) as unknown as
      ResourceDbRow | undefined;
    return row ? toResource(row) : null;
  }

  getResourceByToken(token: string): HostedResourceRow | null {
    const row = this.db.prepare("SELECT * FROM hosted_resources WHERE token = ?").get(token) as unknown as
      ResourceDbRow | undefined;
    return row ? toResource(row) : null;
  }

  insertResource(row: HostedResourceRow): void {
    this.db
      .prepare(
        `INSERT INTO hosted_resources
           (id, token, display_name, format, kind, created_at, updated_at, disabled_at, notes, tags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.token,
        row.displayName,
        row.format,
        row.kind,
        row.createdAt,
        row.updatedAt,
        row.disabledAt,
        row.notes,
        JSON.stringify(row.tags),
      );
  }

  renameResource(id: string, displayName: string, updatedAt: string): void {
    this.db
      .prepare("UPDATE hosted_resources SET display_name = ?, updated_at = ? WHERE id = ?")
      .run(displayName, updatedAt, id);
  }

  updateMetadata(
    id: string,
    displayName: string,
    notes: string,
    tags: string[],
    kind: HostedResourceKind | null,
    updatedAt: string,
  ): void {
    this.db
      .prepare(
        "UPDATE hosted_resources SET display_name = ?, notes = ?, tags_json = ?, kind = ?, updated_at = ? WHERE id = ?",
      )
      .run(displayName, notes, JSON.stringify(tags), kind, updatedAt, id);
  }

  /** Disabling is reversible: `null` re-enables serving. */
  setResourceDisabled(id: string, disabledAt: string | null, updatedAt: string): void {
    this.db
      .prepare("UPDATE hosted_resources SET disabled_at = ?, updated_at = ? WHERE id = ?")
      .run(disabledAt, updatedAt, id);
  }

  deleteResource(id: string): void {
    this.db.prepare("DELETE FROM hosted_resources WHERE id = ?").run(id);
  }

  listRevisions(resourceId: string): HostedResourceRevisionRow[] {
    const rows = this.db
      .prepare("SELECT * FROM hosted_resource_revisions WHERE resource_id = ? ORDER BY sequence DESC")
      .all(resourceId) as unknown as RevisionDbRow[];
    return rows.map(toRevision);
  }

  getPublishedRevision(resourceId: string): HostedResourceRevisionRow | null {
    const row = this.db
      .prepare(
        `SELECT * FROM hosted_resource_revisions
         WHERE resource_id = ? AND published_at IS NOT NULL`,
      )
      .get(resourceId) as unknown as RevisionDbRow | undefined;
    return row ? toRevision(row) : null;
  }

  getRevision(id: string): HostedResourceRevisionRow | null {
    const row = this.db.prepare("SELECT * FROM hosted_resource_revisions WHERE id = ?").get(id) as unknown as
      RevisionDbRow | undefined;
    return row ? toRevision(row) : null;
  }

  nextSequence(resourceId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(sequence), 0) AS maxSequence FROM hosted_resource_revisions WHERE resource_id = ?")
      .get(resourceId) as unknown as { maxSequence: number };
    return row.maxSequence + 1;
  }

  insertRevision(row: HostedResourceRevisionRow): void {
    this.db
      .prepare(
        `INSERT INTO hosted_resource_revisions
           (id, resource_id, sequence, content, sha256, validation, created_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.resourceId,
        row.sequence,
        row.content,
        row.sha256,
        row.validation,
        row.createdAt,
        row.publishedAt,
      );
  }

  /**
   * Atomic swap: clear the current published revision and set the new one in a
   * single transaction, so a served body is always exactly one revision.
   */
  publishRevision(resourceId: string, revisionId: string, publishedAt: string): void {
    this.db.exec("BEGIN;");
    try {
      this.db
        .prepare(
          `UPDATE hosted_resource_revisions SET published_at = NULL
           WHERE resource_id = ? AND published_at IS NOT NULL`,
        )
        .run(resourceId);
      this.db
        .prepare(
          `UPDATE hosted_resource_revisions SET published_at = ?
           WHERE id = ? AND resource_id = ?`,
        )
        .run(publishedAt, revisionId, resourceId);
      this.db.prepare("UPDATE hosted_resources SET updated_at = ? WHERE id = ?").run(publishedAt, resourceId);
      this.db.exec("COMMIT;");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK;");
      } catch {
        // ignore rollback failure; original error is what matters
      }
      throw error;
    }
  }

  /** Atomically publishes a revision and updates the operator metadata with it. */
  publishNewRevision(input: {
    resourceId: string;
    displayName: string;
    notes: string;
    tags: string[];
    kind: HostedResourceKind | null;
    publishedAt: string;
    revision: HostedResourceRevisionRow;
  }): void {
    this.db.exec("BEGIN;");
    try {
      const sequenceRow = this.db
        .prepare(
          "SELECT COALESCE(MAX(sequence), 0) AS maxSequence FROM hosted_resource_revisions WHERE resource_id = ?",
        )
        .get(input.resourceId) as unknown as { maxSequence: number };
      const revision = { ...input.revision, sequence: sequenceRow.maxSequence + 1 };
      this.db
        .prepare(
          `UPDATE hosted_resource_revisions SET published_at = NULL
           WHERE resource_id = ? AND published_at IS NOT NULL`,
        )
        .run(input.resourceId);
      this.db
        .prepare(
          `INSERT INTO hosted_resource_revisions
             (id, resource_id, sequence, content, sha256, validation, created_at, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          revision.id,
          revision.resourceId,
          revision.sequence,
          revision.content,
          revision.sha256,
          revision.validation,
          revision.createdAt,
          revision.publishedAt,
        );
      this.db
        .prepare(
          `UPDATE hosted_resources
           SET display_name = ?, notes = ?, tags_json = ?, kind = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.displayName,
          input.notes,
          JSON.stringify(input.tags),
          input.kind,
          input.publishedAt,
          input.resourceId,
        );
      this.db.exec("COMMIT;");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK;");
      } catch {
        // ignore rollback failure; original error is what matters
      }
      throw error;
    }
  }
}
