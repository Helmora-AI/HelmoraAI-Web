import type { ModelDefinition } from "../lib/api/types";

export interface ModelDraft {
  id: string;
  providerId: string;
  upstreamId: string;
  displayName: string;
  family: string;
  contextWindow: string;
  maxOutputTokens: string;
  tools: boolean;
  reasoning: boolean;
  embeddings: boolean;
  catalogRevision?: string;
}

/** Create defaults only — never applied on edit. */
export const CREATE_CAPABILITY_DEFAULTS = {
  modalities: ["text"] as string[],
  parallelToolsFromTools: true,
  structuredOutput: true,
  streaming: true,
  pricing: {} as ModelDefinition["pricing"],
  catalogRevision: "web-v2",
};

/**
 * Build POST /api/v2/models body.
 * Create uses explicit defaults. Edit preserves pricing and every capability
 * the form does not edit (modalities, parallelTools, structuredOutput, streaming).
 */
export function buildModelUpsertBody(draft: ModelDraft, original?: ModelDefinition): Record<string, unknown> {
  if (original) {
    return {
      id: original.id,
      providerId: original.providerId,
      upstreamId: original.upstreamId,
      displayName: draft.displayName.trim() || original.displayName || original.upstreamId,
      family: draft.family.trim() || original.family || original.upstreamId,
      contextWindow: Number(draft.contextWindow),
      maxOutputTokens: Number(draft.maxOutputTokens),
      capabilities: {
        modalities: [...original.capabilities.modalities],
        tools: draft.tools,
        parallelTools: original.capabilities.parallelTools,
        structuredOutput: original.capabilities.structuredOutput,
        reasoning: draft.reasoning,
        streaming: original.capabilities.streaming,
        embeddings: draft.embeddings,
      },
      pricing: { ...original.pricing },
    };
  }

  return {
    id: draft.id.trim() || `${draft.providerId}:${draft.upstreamId}`,
    providerId: draft.providerId,
    upstreamId: draft.upstreamId,
    displayName: draft.displayName.trim() || draft.upstreamId,
    family: draft.family.trim() || draft.upstreamId,
    contextWindow: Number(draft.contextWindow),
    maxOutputTokens: Number(draft.maxOutputTokens),
    capabilities: {
      modalities: [...CREATE_CAPABILITY_DEFAULTS.modalities],
      tools: draft.tools,
      parallelTools: CREATE_CAPABILITY_DEFAULTS.parallelToolsFromTools ? draft.tools : false,
      structuredOutput: CREATE_CAPABILITY_DEFAULTS.structuredOutput,
      reasoning: draft.reasoning,
      streaming: CREATE_CAPABILITY_DEFAULTS.streaming,
      embeddings: draft.embeddings,
    },
    pricing: { ...CREATE_CAPABILITY_DEFAULTS.pricing },
    catalogRevision: CREATE_CAPABILITY_DEFAULTS.catalogRevision,
  };
}
