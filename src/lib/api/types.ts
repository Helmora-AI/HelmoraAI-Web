export interface HelmoraErrorPayload {
  error: {
    type: string;
    code: string;
    message: string;
    request_id: string;
    retryable: boolean;
    retry_after_ms: number | null;
    details?: Record<string, unknown>;
  };
}

export interface HealthResponse {
  status: string;
  version?: string;
  uptime_seconds?: number;
}

export interface ReadyResponse {
  status: "ready" | "draining" | "unhealthy";
  initialized: boolean;
  database: string;
  inflight: number;
}

export interface Principal {
  type: "anonymous" | "setup" | "recovery" | "client" | "admin" | "internal";
  tenantId?: string;
  userId?: string;
  apiKeyId?: string;
  sessionId?: string;
  scopes: readonly string[];
}

export interface SessionResponse {
  principal: Principal;
  csrf_token?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  authenticated: true;
  csrf_token: string;
  expires_at: string;
}

export interface SetupRequest extends LoginRequest {
  tenantName: string;
  setupToken?: string;
}

export interface SetupResponse {
  initialized: true;
  api_key: string;
  api_key_id: string;
  user_id: string;
  warning: string;
}

export interface RuntimeStatus {
  status: "ready" | "draining";
  initialized: boolean;
  database: string;
  version: string;
  inflight: number;
}

export interface RuntimeVersion {
  name: string;
  version: string;
  api: string;
}

export interface ListResponse<T> {
  data: T[];
}

export interface ModelSummary {
  id: string;
  object?: string;
  owned_by?: string;
  displayName?: string;
  providerId?: string;
  [key: string]: unknown;
}

export type MessageRole = "system" | "developer" | "user" | "assistant" | "tool";

export interface MessagePart {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  arguments?: string;
  content?: unknown;
  [key: string]: unknown;
}

export interface StoredMessage {
  id: string;
  branchId: string;
  sequence: number;
  role: MessageRole;
  parts: MessagePart[];
  memoryPolicy: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  tenantId: string;
  userId?: string;
  title: string;
  archived: boolean;
  activeBranchId: string;
  summary?: { text: string; throughSequence: number };
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationList {
  data: Conversation[];
  nextCursor?: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: StoredMessage[];
}

export interface ResponsesCompletedEvent {
  type: "response.completed";
  response: {
    id: string;
    status: "completed";
    model: string;
    output_text: string;
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
  };
}

export interface NativeChatResponse {
  id: string;
  model: string;
  output_text: string;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  helmora: {
    conversation_id: string;
    context: Record<string, unknown>;
    rounds: number;
    tool_runs: Array<Record<string, unknown>>;
    citations: Array<{ id: string; url: string; title: string; snippet?: string; toolName: string; toolRunId: string }>;
  };
}

export interface ProviderConfigField {
  key: string;
  label: string;
  kind: "string" | "secret";
  required: boolean;
  placeholder?: string;
  description?: string;
  pattern?: string;
  max_length?: number;
}

export interface ProviderManifestSummary {
  id: string;
  display_name: string;
  protocol: string;
  policy_class: string;
  default_base_url?: string | null;
  enabled: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
  executor_id: string;
  availability: "active" | "coming_soon" | "blocked";
  availability_reason_code: string;
  connectable_auth_modes: Array<"api_key" | "none">;
  allow_custom_base_url: boolean;
  auth_style: string;
  default_model?: string | null;
  capabilities: string[];
  config_fields: ProviderConfigField[];
  signup_url?: string | null;
  icon_key: string;
  source: string;
  source_id: string;
  aliases: string[];
  timeout_ms?: number | null;
  has_static_extra_headers?: boolean;
  tier: 1 | 2 | 3;
}

export type ConnectionVerifyStatus = "ok" | "failed" | "stale";

export type ConnectionDiagnosticCode =
  | "ok"
  | "missing_credential"
  | "auth_failed"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "request_rejected"
  | "upstream_error"
  | "protocol_not_ready";

export type ModelDiscoveryStatus = "available" | "empty" | "unsupported" | "failed";

export interface ConnectionValidation {
  ok: boolean;
  code: ConnectionDiagnosticCode;
  message: string;
  latencyMs?: number;
  discoveryStatus: ModelDiscoveryStatus;
  discoveredModels?: string[];
  discoveredModelsTruncated?: boolean;
}

export interface ConnectionImportModelsResponse {
  connectionId: string;
  providerId: string;
  results: Array<{
    upstreamId: string;
    modelId: string;
    status: "created" | "skipped_existing";
  }>;
}

export interface ConnectionVerifySummary {
  version: 1;
  status: ConnectionVerifyStatus;
  code: string;
  message: string;
  model: string;
  executorId: string;
  verifiedAt: string;
  latencyMs: number;
  inputFingerprint: string;
}

export interface ProviderConnection {
  id: string;
  provider_id: string;
  name: string;
  base_url?: string | null;
  auth_type: string;
  enabled: boolean;
  priority: number;
  max_concurrency: number;
  config: Record<string, unknown>;
  secret_configured: boolean;
  verify?: ConnectionVerifySummary | null;
  created_at: string;
  updated_at: string;
}

export interface ProvidersResponse {
  providers: ProviderManifestSummary[];
  connections: ProviderConnection[];
}

export interface ModelDefinition {
  id: string;
  providerId: string;
  upstreamId: string;
  displayName: string;
  family: string;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: { modalities: string[]; tools: boolean; parallelTools: boolean; structuredOutput: boolean; reasoning: boolean; streaming: boolean; embeddings: boolean };
  pricing: { inputPerMillionUsd?: number; outputPerMillionUsd?: number };
  catalogRevision: string;
  /** Present on admin GET /api/v2/models (includes disabled imports). */
  enabled?: boolean;
}

export interface RouteTarget { modelId: string; connectionId: string; priority: number; weight: number; enabled: boolean; }
export interface RouteProfile { id: string; name: string; strategy: string; config: Record<string, unknown>; enabled: boolean; revision: number; targets: RouteTarget[]; createdAt: string; updatedAt: string; }

export interface MemoryRecord { id: string; userId?: string; sourceMessageId?: string; kind: string; content: string; pinned: boolean; sensitivity: string; expiresAt?: string; createdAt: string; updatedAt: string; }
export interface FileRecord { id: string; filename: string; mediaType: string; bytes: number; sha256: string; status: string; metadata: Record<string, unknown>; createdAt: string; updatedAt: string; }
export interface KnowledgeBase { id: string; name: string; revision: number; config: Record<string, unknown>; createdAt: string; updatedAt: string; }
export interface KnowledgeDocument { id: string; knowledgeBaseId: string; fileId?: string; title: string; content: string; metadata: Record<string, unknown>; createdAt: string; updatedAt: string; }
export interface SearchResult { id: string; title: string; url: string; snippet: string; publishedAt?: string; source: string; score?: number; }
export interface SearchResponse { query: string; provider: string; results: SearchResult[]; answer?: string; tookMs: number; }
export interface FetchedDocument { requestedUrl: string; finalUrl: string; title: string; mediaType: string; text: string; excerpt: string; links: Array<{ text: string; url: string }>; fetchedAt: string; bytes: number; truncated: boolean; }
export interface TaskRecord { id: string; kind: string; status: string; input: unknown; result?: unknown; error?: unknown; progress: number; cancelRequested: boolean; createdAt: string; updatedAt: string; completedAt?: string; }
export interface TaskEvent { sequence: number; type: string; payload: unknown; createdAt: string; }
export interface TaskDetail { task: TaskRecord; events: TaskEvent[]; }
export interface ApiKeyRecord { id: string; name: string; key_hint: string; scopes: string[]; model_allowlist: string[] | null; limits: Record<string, number>; disabled: boolean; expires_at: string | null; last_used_at: string | null; created_at: string; updated_at: string; }
export interface ApiKeyReceipt { id: string; key: string; hint: string; }
export interface UsageSummary { requests: number; successful: number; input_tokens: number; output_tokens: number; cost_usd: number; average_latency_ms: number; days: number; }
export interface UsageRequest { id: string; protocol: string; requested_model: string; selected_model: string | null; selected_provider: string | null; status: string; attempt_count: number; prompt_tokens: number; completion_tokens: number; cost_usd: number; latency_ms: number; error_code: string | null; created_at: string; completed_at: string | null; }
export interface UsageResponse { summary: UsageSummary; requests: UsageRequest[]; }
export interface AuditEvent { id: string; actor_type: string; actor_id: string | null; action: string; target_type: string; target_id: string | null; request_id: string | null; outcome: string; metadata: Record<string, unknown>; created_at: string; }
export interface ToolDefinition { name: string; description?: string; inputSchema?: Record<string, unknown>; input_schema?: Record<string, unknown>; risk: string; timeoutMs: number; [key: string]: unknown; }
export interface WebhookRecord { id: string; url: string; events: string[]; enabled: boolean; createdAt: string; updatedAt: string; }
export interface WebhookReceipt { webhook: WebhookRecord; secret: string; }
