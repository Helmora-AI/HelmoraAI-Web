import { Badge, Button } from "@astryxdesign/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { InlineAlert, RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type { Conversation, ConversationDetail, ConversationList, ListResponse, ModelSummary, NativeChatResponse, ResponsesCompletedEvent, StoredMessage } from "../lib/api/types";

interface DraftMessage { id: string; role: "user" | "assistant"; text: string; pending?: boolean; }
interface RunCitation { id: string; url: string; title: string; snippet?: string; }
interface RunReceipt { responseId?: string; model?: string; usage?: { input_tokens: number; output_tokens: number; total_tokens: number } | null; rounds?: number; toolRuns?: Array<Record<string, unknown>>; citations?: RunCitation[]; context?: Record<string, unknown>; }

export function ChatPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversationId, setConversationId] = useState<string | undefined>(() => searchParams.get("conversation") || undefined);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("");
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [optimistic, setOptimistic] = useState<DraftMessage[]>([]);
  const [error, setError] = useState<unknown>();
  const [receipt, setReceipt] = useState<RunReceipt>();
  const [isRunning, setIsRunning] = useState(false);
  const [announcement, setAnnouncement] = useState("Ready for a message.");
  const [runNotice, setRunNotice] = useState<string>();
  const controller = useRef<AbortController | undefined>(undefined);

  const conversations = useQuery({ queryKey: ["conversations", "chat"], queryFn: () => api.request<ConversationList>("/api/v2/conversations?limit=50") });
  const detail = useQuery({ queryKey: ["conversation", conversationId], queryFn: () => api.request<ConversationDetail>(`/api/v2/conversations/${encodeURIComponent(conversationId!)}`), enabled: Boolean(conversationId) });
  const models = useQuery({ queryKey: ["route-models"], queryFn: () => api.request<ListResponse<ModelSummary>>("/api/v2/routes/models") });

  useEffect(() => {
    if (!model && models.data?.data[0]?.id) setModel(models.data.data[0].id);
  }, [model, models.data]);
  useEffect(() => {
    const requested = searchParams.get("conversation") || undefined;
    setConversationId((current) => current === requested ? current : requested);
  }, [searchParams]);

  const running = isRunning;
  const storedMessages = detail.data?.messages ?? [];
  const visibleMessages = useMemo(() => [...storedMessages.map(toDraftMessage), ...optimistic], [storedMessages, optimistic]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || controller.current || !model) return;
    const abort = new AbortController();
    controller.current = abort;
    setIsRunning(true);
    setDraft("");
    setError(undefined);
    setReceipt(undefined);
    setRunNotice(undefined);
    setAnnouncement("Helmora is responding.");
    setOptimistic([{ id: `local-user-${Date.now()}`, role: "user", text }, { id: `local-assistant-${Date.now()}`, role: "assistant", text: "", pending: true }]);
    try {
      if (toolsEnabled || memoryEnabled) await sendNative(text, abort.signal);
      else await sendStreaming(text, abort.signal);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["conversation"] }),
      ]);
      setOptimistic([]);
      setAnnouncement("Response complete.");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setRunNotice("Generation stopped. The partial response was kept.");
        setAnnouncement("Response stopped.");
      } else {
        setError(cause);
        setAnnouncement("Response failed.");
      }
      setOptimistic((current) => current.map((message) => message.role === "assistant" ? { ...message, pending: false } : message));
    } finally {
      controller.current = undefined;
      setIsRunning(false);
    }
  }

  async function sendNative(text: string, signal: AbortSignal) {
    const response = await api.request<NativeChatResponse>("/api/v2/chat", {
      method: "POST",
      signal,
      headers: {
        "x-helmora-tools": toolsEnabled ? "auto" : "off",
        "x-helmora-memory": memoryEnabled ? "auto" : "off",
      },
      body: { model, input: text, ...(conversationId ? { conversationId } : {}), maxToolRounds: 6 },
    });
    updateConversation(response.helmora.conversation_id);
    setOptimistic((current) => current.map((message) => message.role === "assistant" ? { ...message, text: response.output_text, pending: false } : message));
    setReceipt({ responseId: response.id, model: response.model, ...(response.usage === undefined ? {} : { usage: response.usage }), rounds: response.helmora.rounds, toolRuns: response.helmora.tool_runs, citations: response.helmora.citations, context: response.helmora.context });
  }

  async function sendStreaming(text: string, signal: AbortSignal) {
    let activeId = conversationId;
    if (!activeId) {
      const created = await api.request<Conversation>("/api/v2/conversations", { method: "POST", signal, body: { title: text.slice(0, 80) } });
      activeId = created.id;
      updateConversation(activeId);
    }
    await api.request<StoredMessage>(`/api/v2/conversations/${encodeURIComponent(activeId)}/messages`, { method: "POST", signal, body: { role: "user", content: text } });
    const fresh = await api.request<ConversationDetail>(`/api/v2/conversations/${encodeURIComponent(activeId)}`, { signal });
    let output = "";
    let completed: ResponsesCompletedEvent["response"] | undefined;
    let streamError: unknown;
    try {
      for await (const event of api.stream<Record<string, unknown>>("/v1/responses", {
        method: "POST",
        signal,
        headers: { "x-helmora-tools": "off", "x-helmora-memory": "off" },
        body: { model, stream: true, input: fresh.messages.map(toResponseInput).filter((item): item is Record<string, unknown> => item !== undefined) },
      })) {
        if (event.event === "response.output_text.delta" && typeof event.data.delta === "string") {
          output += event.data.delta;
          setOptimistic((current) => current.map((message) => message.role === "assistant" ? { ...message, text: output, pending: true } : message));
        }
        if (event.event === "response.completed") completed = (event.data as unknown as ResponsesCompletedEvent).response;
        if (event.event === "response.failed" || event.event === "error") throw new Error(String(event.data.message ?? "The model stream failed."));
      }
    } catch (cause) {
      streamError = cause;
    }
    if (!output && completed?.output_text) output = completed.output_text;
    if (output) {
      // Once a stream has been aborted its signal cannot be reused. Persist the
      // visible partial output with a fresh request before rethrowing the original
      // stream outcome, otherwise a reload silently loses text the UI said it kept.
      await api.request<StoredMessage>(`/api/v2/conversations/${encodeURIComponent(activeId)}/messages`, {
        method: "POST",
        ...(streamError === undefined ? { signal } : {}),
        body: { role: "assistant", content: output },
      });
    }
    if (streamError !== undefined) throw streamError;
    setOptimistic((current) => current.map((message) => message.role === "assistant" ? { ...message, text: output, pending: false } : message));
    setReceipt({ ...(completed?.id ? { responseId: completed.id } : {}), model: completed?.model ?? model, ...(completed?.usage === undefined ? {} : { usage: completed.usage }) });
  }

  function stop() { controller.current?.abort(new DOMException("Stopped by user", "AbortError")); }
  function updateConversation(id: string | undefined) {
    setConversationId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set("conversation", id);
    else next.delete("conversation");
    setSearchParams(next, { replace: true });
  }
  function selectConversation(id: string | undefined) { if (running) return; updateConversation(id); setOptimistic([]); setError(undefined); setReceipt(undefined); setRunNotice(undefined); }

  return (
    <div className="chat-workspace">
      <aside className="chat-history">
        <div className="chat-history__header"><div><p className="eyebrow">Workspace</p><h2>Chat</h2></div><Button label="New chat" variant="secondary" size="sm" onClick={() => { selectConversation(undefined); }} /></div>
        <div className="chat-history__list">
          {conversations.isPending ? <p className="muted-copy">Loading conversations…</p> : conversations.data?.data.length ? conversations.data.data.map((conversation) => (
            <button key={conversation.id} className={conversation.id === conversationId ? "chat-history__item chat-history__item--active" : "chat-history__item"} onClick={() => { selectConversation(conversation.id); }}>
              <strong>{conversation.title}</strong><small>{formatTime(conversation.updatedAt)}</small>
            </button>
          )) : <p className="muted-copy">No conversations yet.</p>}
        </div>
      </aside>
      <section className="chat-main">
        <header className="chat-toolbar">
          <label><span>Model</span><select value={model} onChange={(event) => { setModel(event.target.value); }} disabled={running || models.isPending}>
            {models.data?.data.map((item) => <option value={item.id} key={item.id}>{item.displayName ?? item.id}</option>)}
            {!models.data?.data.length ? <option value="">No routed models</option> : null}
          </select></label>
          <div className="chat-toggles">
            <Toggle label="Memory" checked={memoryEnabled} onChange={setMemoryEnabled} disabled={running} />
            <Toggle label="Agent tools" checked={toolsEnabled} onChange={setToolsEnabled} disabled={running} />
          </div>
        </header>
        <div className="chat-transcript" role="log" aria-label="Conversation messages" aria-busy={running}>
          {detail.isPending && conversationId ? <p className="muted-copy">Loading conversation…</p> : visibleMessages.length ? visibleMessages.map((message) => <MessageBubble key={message.id} message={message} />) : <ChatEmpty modelsReady={Boolean(models.data?.data.length)} />}
          {error ? <RequestError error={error} /> : null}
          {runNotice ? <InlineAlert title="Generation stopped">{runNotice}</InlineAlert> : null}
          {receipt ? <Receipt receipt={receipt} /> : null}
        </div>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
        <form className="composer" onSubmit={(event) => { void send(event); }}>
          <textarea value={draft} onChange={(event) => { setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={model ? "Ask Helmora anything…" : "Configure a routed model to begin"} disabled={running || !model} rows={1} aria-label="Message" />
          <div className="composer__footer"><span>{toolsEnabled || memoryEnabled ? "Agent mode · buffered result" : "Direct mode · live stream"}</span>{running ? <Button label="Stop" variant="destructive" size="sm" onClick={stop} /> : <Button type="submit" label="Send" variant="primary" size="sm" isDisabled={!draft.trim() || !model} />}</div>
        </form>
      </section>
    </div>
  );
}

function toDraftMessage(message: StoredMessage): DraftMessage { return { id: message.id, role: message.role === "assistant" ? "assistant" : "user", text: message.parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("") }; }
function toResponseInput(message: StoredMessage): Record<string, unknown> | undefined { if (!["system", "developer", "user", "assistant"].includes(message.role)) return undefined; return { type: "message", role: message.role, content: message.parts.filter((part) => part.type === "text").map((part) => ({ type: message.role === "assistant" ? "output_text" : "input_text", text: part.text ?? "" })) }; }
function MessageBubble({ message }: { message: DraftMessage }) {
  const [copied, setCopied] = useState(false);
  async function copyResponse() {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 1_500);
    } catch { setCopied(false); }
  }
  return <article className={`message message--${message.role}${message.pending ? " message--pending" : ""}`}><header><span>{message.role === "assistant" ? "Helmora" : "You"}</span>{message.pending ? <Badge variant="info" label="Thinking" /> : null}{message.role === "assistant" && !message.pending && message.text ? <button className="message__copy" type="button" onClick={() => { void copyResponse(); }}>{copied ? "Copied" : "Copy response"}</button> : null}</header><div className="message__content"><ReactMarkdown components={{ pre: CodeBlock }} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{message.text || "…"}</ReactMarkdown></div></article>;
}
function CodeBlock({ children }: { children?: ReactNode }) {
  const block = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(block.current?.innerText ?? "");
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 1_500);
    } catch { setCopied(false); }
  }
  return <div className="code-block"><button type="button" onClick={() => { void copyCode(); }}>{copied ? "Copied" : "Copy code"}</button><pre ref={block}>{children}</pre></div>;
}
function ChatEmpty({ modelsReady }: { modelsReady: boolean }) { return <div className="chat-empty"><span>✦</span><p className="eyebrow">Helmora intelligence</p><h2>{modelsReady ? "Where should we begin?" : "Connect a model to begin."}</h2><p>{modelsReady ? "Direct mode streams every token. Enable memory or agent tools when the task needs deeper context or action." : "Create a provider connection and route, then return here."}</p></div>; }
function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled: boolean }) { return <label className="toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => { onChange(event.target.checked); }} /><span aria-hidden="true" /><strong>{label}</strong></label>; }
function Receipt({ receipt }: { receipt: RunReceipt }) { return <details className="run-receipt"><summary>Run receipt</summary><div>{receipt.responseId ? <span>Response <strong>{receipt.responseId}</strong></span> : null}{receipt.model ? <span>Model <strong>{receipt.model}</strong></span> : null}{receipt.usage ? <span>Tokens <strong>{receipt.usage.total_tokens}</strong></span> : null}{receipt.rounds ? <span>Agent rounds <strong>{receipt.rounds}</strong></span> : null}{receipt.toolRuns !== undefined ? <span>Tool runs <strong>{receipt.toolRuns.length}</strong></span> : null}{receipt.citations !== undefined ? <span>Sources <strong>{receipt.citations.length}</strong></span> : null}{receipt.context ? <span>Context <strong>packed</strong></span> : null}</div>{receipt.toolRuns?.length ? <ol className="run-receipt__tools">{receipt.toolRuns.map((run, index) => <li key={String(run.runId ?? run.id ?? index)}><strong>{String(run.name ?? run.toolId ?? run.tool_id ?? `Tool ${index + 1}`)}</strong><span>{String(run.status ?? "completed")}</span>{typeof run.durationMs === "number" ? <small>{run.durationMs} ms</small> : null}</li>)}</ol> : null}{receipt.citations?.length ? <ol className="run-receipt__tools" aria-label="Validated sources">{receipt.citations.map((citation) => <li key={citation.id}><strong>{citation.id}</strong><a href={citation.url} target="_blank" rel="noreferrer noopener">{citation.title}</a>{citation.snippet ? <small>{citation.snippet}</small> : null}</li>)}</ol> : null}</details>; }
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
