import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import { sanitizeServerIniPayload } from "@shared/ini-text";
import { stripYarkOwnedFromPayload } from "@shared/yark-owned-ini-keys";
import type {
  ClusterIniTemplate,
  IniPreview,
  ServerIniPayload,
} from "@shared/types";
import type { ClusterIniTemplateRepository } from "../../infra/db/cluster-ini-template-repository";
import { buildIniPreview } from "./ini-preview";

const EMPTY_PAYLOAD: ServerIniPayload = {
  gameUserSettings: "",
  game: "",
};

function normalizeClusterId(clusterId: string): string {
  const id = clusterId.trim();
  if (id.length === 0) {
    throw new Error("Cluster ID is required");
  }
  return id;
}

/** Sanitize client noise and strip YARK-owned per-server keys. */
export function prepareClusterIniTemplatePayload(
  payload: ServerIniPayload,
): ServerIniPayload {
  return stripYarkOwnedFromPayload(sanitizeServerIniPayload(payload));
}

/** Defaults suitable for a new template (owned keys already removed). */
export function defaultClusterIniTemplatePayload(): ServerIniPayload {
  return prepareClusterIniTemplatePayload({
    gameUserSettings: defaultGameUserSettingsIni,
    game: defaultGameIni,
  });
}

/**
 * Cluster INI template CRUD (#88). Persistence only — never writes member installs.
 */
export class ClusterIniTemplateService {
  constructor(private readonly repo: ClusterIniTemplateRepository) {}

  get(clusterId: string): ClusterIniTemplate | null {
    return this.repo.get(normalizeClusterId(clusterId));
  }

  /**
   * Returns stored template, or a non-persisted draft seeded from defaults
   * when none exists yet (for editor create flow).
   */
  getOrDraft(clusterId: string): ClusterIniTemplate {
    const id = normalizeClusterId(clusterId);
    const existing = this.repo.get(id);
    if (existing !== null) {
      return existing;
    }
    return {
      clusterId: id,
      payload: defaultClusterIniTemplatePayload(),
      updatedAt: new Date().toISOString(),
    };
  }

  preview(clusterId: string, payload: ServerIniPayload): IniPreview {
    const id = normalizeClusterId(clusterId);
    const current = this.repo.get(id)?.payload ?? EMPTY_PAYLOAD;
    const next = prepareClusterIniTemplatePayload(payload);
    return buildIniPreview(current, next);
  }

  save(clusterId: string, payload: ServerIniPayload): {
    template: ClusterIniTemplate;
    preview: IniPreview;
  } {
    const id = normalizeClusterId(clusterId);
    const current = this.repo.get(id)?.payload ?? EMPTY_PAYLOAD;
    const next = prepareClusterIniTemplatePayload(payload);
    const preview = buildIniPreview(current, next);
    if (!preview.valid) {
      throw new Error(
        `Invalid INI: ${preview.issues.map((i) => `${i.fileKey}: ${i.message}`).join(" | ")}`,
      );
    }
    const template = this.repo.upsert(id, next);
    return { template, preview };
  }

  /** Deletes the template row only — never deletes server INI files. */
  delete(clusterId: string): boolean {
    return this.repo.delete(normalizeClusterId(clusterId));
  }
}
