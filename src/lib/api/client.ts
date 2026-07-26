import type { HelmoraErrorPayload } from "./types";

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  csrf?: boolean;
}

export interface SseEvent<T = unknown> {
  event: string;
  data: T;
  id?: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId?: string;
  public readonly retryable: boolean;
  public readonly retryAfterMs: number | null;
  public readonly details?: Record<string, unknown>;

  public constructor(input: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    retryable?: boolean;
    retryAfterMs?: number | null;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.retryAfterMs = input.retryAfterMs ?? null;
    if (input.requestId !== undefined) this.requestId = input.requestId;
    if (input.details !== undefined) this.details = input.details;
  }
}

export class ApiClient {
  private csrfToken: string | undefined;

  public constructor(private readonly baseUrl = "") {}

  public setCsrfToken(token: string | undefined): void {
    this.csrfToken = token;
  }

  public clearSessionState(): void {
    this.csrfToken = undefined;
  }

  public async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const headers = new Headers(options.headers);
    const body = serializeBody(options.body, headers);
    if (shouldAttachCsrf(method, options.csrf) && this.csrfToken) {
      headers.set("x-csrf-token", this.csrfToken);
    }
    headers.set("accept", "application/json");

    let response: Response;
    try {
      response = await fetch(this.url(path), {
        method,
        headers,
        credentials: "include",
        ...(body === undefined ? {} : { body }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiError({
        status: 0,
        code: "HUB_UNREACHABLE",
        message: "Helmora Hub could not be reached.",
        retryable: true,
      });
    }

    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return await decodeResponse<T>(response);
  }

  public async *stream<T = unknown>(path: string, options: ApiRequestOptions = {}): AsyncGenerator<SseEvent<T>> {
    const method = options.method ?? "POST";
    const headers = new Headers(options.headers);
    const body = serializeBody(options.body, headers);
    headers.set("accept", "text/event-stream");
    if (shouldAttachCsrf(method, options.csrf) && this.csrfToken) {
      headers.set("x-csrf-token", this.csrfToken);
    }

    let response: Response;
    try {
      response = await fetch(this.url(path), {
        method,
        headers,
        credentials: "include",
        ...(body === undefined ? {} : { body }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiError({ status: 0, code: "HUB_UNREACHABLE", message: "Helmora Hub could not be reached.", retryable: true });
    }

    if (!response.ok) throw await toApiError(response);
    if (!response.body) throw new ApiError({ status: response.status, code: "STREAM_UNAVAILABLE", message: "The response stream is unavailable." });

    for await (const event of parseEventStream<T>(response.body, options.signal)) yield event;
  }

  public async blob(path: string, signal?: AbortSignal): Promise<{ data: Blob; filename?: string }> {
    let response: Response;
    try {
      response = await fetch(this.url(path), { method: "GET", credentials: "include", ...(signal === undefined ? {} : { signal }) });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiError({ status: 0, code: "HUB_UNREACHABLE", message: "Helmora Hub could not be reached.", retryable: true });
    }
    if (!response.ok) throw await toApiError(response);
    const disposition = response.headers.get("content-disposition") ?? "";
    const match = /filename="([^"]+)"/u.exec(disposition);
    return { data: await response.blob(), ...(match?.[1] === undefined ? {} : { filename: match[1] }) };
  }

  private url(path: string): string {
    if (/^https?:\/\//u.test(path)) return path;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl.replace(/\/$/u, "")}${suffix}`;
  }
}

export const api = new ApiClient();

function shouldAttachCsrf(method: string, override: boolean | undefined): boolean {
  if (override !== undefined) return override;
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function serializeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (typeof body === "string" || body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return body as BodyInit;
  }
  headers.set("content-type", "application/json");
  return JSON.stringify(body);
}

async function decodeResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return await response.json() as T;
  return await response.text() as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: HelmoraErrorPayload | undefined;
  try {
    payload = await response.json() as HelmoraErrorPayload;
  } catch {
    payload = undefined;
  }
  const error = payload?.error;
  return new ApiError({
    status: response.status,
    code: error?.code ?? `HTTP_${response.status}`,
    message: error?.message ?? response.statusText ?? "The request failed.",
    ...(error?.request_id === undefined ? {} : { requestId: error.request_id }),
    retryable: error?.retryable ?? response.status >= 500,
    retryAfterMs: error?.retry_after_ms ?? null,
    ...(error?.details === undefined ? {} : { details: error.details }),
  });
}

async function* parseEventStream<T>(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseEvent<T>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replaceAll("\r\n", "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = decodeSseBlock<T>(block);
        if (event) yield event;
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    const finalEvent = decodeSseBlock<T>(buffer);
    if (finalEvent) yield finalEvent;
  } finally {
    reader.releaseLock();
  }
}

function decodeSseBlock<T>(block: string): SseEvent<T> | undefined {
  if (!block.trim()) return undefined;
  let event = "message";
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const rawValue = separator < 0 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") event = value;
    else if (field === "id") id = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0) return undefined;
  const raw = data.join("\n");
  let decoded: unknown = raw;
  if (raw !== "[DONE]") {
    try { decoded = JSON.parse(raw) as unknown; } catch { decoded = raw; }
  }
  return { event, data: decoded as T, ...(id === undefined ? {} : { id }) };
}
