import { Badge, Button } from "@astryxdesign/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type UIEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { HelmoraScrollArea } from "../components/HelmoraScrollArea";
import { InlineAlert, RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type { Conversation, ConversationDetail, ConversationList, ListResponse, ModelSummary, NativeChatResponse, ResponsesCompletedEvent, StoredMessage, ToolDefinition, UsageAccountingReceipt } from "../lib/api/types";
import { distanceFromBottom, shouldFollowAfterScroll, shouldShowJumpToLatest } from "../lib/chatScrollFollow";

interface DraftMessage { id: string; role: "user" | "assistant"; text: string; pending?: boolean; }
interface RunCitation { id: string; url: string; title: string; snippet?: string; }
interface RunReceipt { responseId?: string; model?: string; usage?: { input_tokens: number; output_tokens: number; total_tokens: number } | null; accounting?: UsageAccountingReceipt; rounds?: number; toolRuns?: Array<Record<string, unknown>>; citations?: RunCitation[]; context?: Record<string, unknown>; }
interface SpeechRecognitionResultLike { isFinal: boolean; 0?: { transcript?: string }; }
interface SpeechRecognitionEventLike { results: ArrayLike<SpeechRecognitionResultLike>; }
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const STARTER_PROMPTS = [
  { label: "Research a topic", prompt: "Research the latest developments in " },
  { label: "Compare options", prompt: "Compare these options and recommend the best fit: " },
  { label: "Plan a project", prompt: "Create a practical step-by-step plan for " },
  { label: "Analyze data", prompt: "Analyze this information, surface patterns, and suggest next actions: " },
];

export function ChatPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversationId, setConversationId] = useState<string | undefined>(() => searchParams.get("conversation") || undefined);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("");
  const [toolsEnabled, setToolsEnabled] = useState(() => searchParams.get("tools") === "auto");
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<DraftMessage[]>([]);
  const [error, setError] = useState<unknown>();
  const [receipt, setReceipt] = useState<RunReceipt>();
  const [isRunning, setIsRunning] = useState(false);
  const [announcement, setAnnouncement] = useState("Ready for a message.");
  const [runNotice, setRunNotice] = useState<string>();
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [listening, setListening] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const recognitionRef = useRef<SpeechRecognitionLike | undefined>(undefined);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const transcriptViewportRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const followRef = useRef(true);
  const scrollFrameRef = useRef(0);
  const [following, setFollowing] = useState(true);
  const [jumpVisible, setJumpVisible] = useState(false);

  const conversations = useQuery({ queryKey: ["conversations", "chat"], queryFn: () => api.request<ConversationList>("/api/v2/conversations?limit=50") });
  const detail = useQuery({ queryKey: ["conversation", conversationId], queryFn: () => api.request<ConversationDetail>(`/api/v2/conversations/${encodeURIComponent(conversationId!)}`), enabled: Boolean(conversationId) });
  const models = useQuery({ queryKey: ["route-models"], queryFn: () => api.request<ListResponse<ModelSummary>>("/api/v2/routes/models") });
  const tools = useQuery({
    queryKey: ["tools", "chat"],
    queryFn: () => api.request<ListResponse<ToolDefinition>>("/api/v2/tools"),
    enabled: toolsEnabled,
    retry: false,
  });

  useEffect(() => {
    if (!model && models.data?.data[0]?.id) setModel(models.data.data[0].id);
  }, [model, models.data]);
  useEffect(() => {
    const requested = searchParams.get("conversation") || undefined;
    setConversationId((current) => current === requested ? current : requested);
    if (searchParams.get("tools") === "auto") setToolsEnabled(true);
  }, [searchParams]);
  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(200, Math.max(54, textarea.scrollHeight))}px`;
  }, [draft]);

  const running = isRunning;
  const storedMessages = detail.data?.messages ?? [];
  const visibleMessages = useMemo(() => [...storedMessages.map(toDraftMessage), ...optimistic], [storedMessages, optimistic]);
  const filteredConversations = useMemo(() => {
    const needle = historySearch.trim().toLowerCase();
    return (conversations.data?.data ?? []).filter((conversation) => !needle || conversation.title.toLowerCase().includes(needle));
  }, [conversations.data?.data, historySearch]);
  const activeModel = models.data?.data.find((item) => item.id === model);
  const filteredModels = useMemo(() => {
    const needle = modelSearch.trim().toLowerCase();
    return (models.data?.data ?? []).filter((item) => !needle || `${item.displayName} ${item.id} ${item.owned_by ?? ""}`.toLowerCase().includes(needle));
  }, [modelSearch, models.data?.data]);
  const voiceSupported = typeof window !== "undefined" && Boolean((window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition
    ?? (window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition);

  useEffect(() => {
    function closeModelMenu(event: PointerEvent) {
      if (!modelPickerRef.current?.contains(event.target as Node)) setModelMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeModelMenu);
    return () => { document.removeEventListener("pointerdown", closeModelMenu); };
  }, []);

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  useEffect(() => {
    followRef.current = true;
    setFollowing(true);
    setJumpVisible(false);
  }, [conversationId]);

  useLayoutEffect(() => {
    if (!followRef.current) {
      const viewport = transcriptViewportRef.current;
      if (viewport) {
        setJumpVisible(shouldShowJumpToLatest(false, distanceFromBottom(viewport.scrollTop, viewport.clientHeight, viewport.scrollHeight) > 4));
      }
      return;
    }
    if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = 0;
      const viewport = transcriptViewportRef.current;
      if (!viewport || !followRef.current) return;
      viewport.scrollTop = viewport.scrollHeight;
      setJumpVisible(false);
    });
    return () => {
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, [visibleMessages, receipt, runNotice, error, running]);

  function onTranscriptScroll(event: UIEvent<HTMLDivElement>) {
    const viewport = event.currentTarget;
    const nextFollow = shouldFollowAfterScroll({
      previouslyFollowing: followRef.current,
      scrollTop: viewport.scrollTop,
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
    });
    if (nextFollow !== followRef.current) {
      followRef.current = nextFollow;
      setFollowing(nextFollow);
    }
    setJumpVisible(shouldShowJumpToLatest(
      nextFollow,
      distanceFromBottom(viewport.scrollTop, viewport.clientHeight, viewport.scrollHeight) > 4,
    ));
  }

  function jumpToLatest() {
    followRef.current = true;
    setFollowing(true);
    setJumpVisible(false);
    const viewport = transcriptViewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }

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
    followRef.current = true;
    setFollowing(true);
    setJumpVisible(false);
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
    setReceipt({ responseId: response.id, model: response.model, ...(response.usage === undefined ? {} : { usage: response.usage }), ...(response.helmora.accounting ? { accounting: response.helmora.accounting } : {}), rounds: response.helmora.rounds, toolRuns: response.helmora.tool_runs, citations: response.helmora.citations, context: response.helmora.context });
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
    const accounting = completed?.id ? await loadAccounting(completed.id, signal) : undefined;
    setReceipt({ ...(completed?.id ? { responseId: completed.id } : {}), model: completed?.model ?? model, ...(completed?.usage === undefined ? {} : { usage: completed.usage }), ...(accounting ? { accounting } : {}) });
  }

  function stop() { controller.current?.abort(new DOMException("Stopped by user", "AbortError")); }
  async function loadAccounting(responseId: string, signal: AbortSignal): Promise<UsageAccountingReceipt | undefined> {
    const requestId = responseId.replace(/^resp_/u, "req_");
    if (!requestId.startsWith("req_")) return undefined;
    try {
      const detail = await api.request<Record<string, unknown>>(`/api/v2/requests/${encodeURIComponent(requestId)}`, { signal });
      return {
        request_ids: [requestId],
        requests: 1,
        physical_attempts: Number(detail.attempt_count ?? 0),
        input_tokens: Number(detail.prompt_tokens ?? 0),
        output_tokens: Number(detail.completion_tokens ?? 0),
        total_tokens: Number(detail.total_tokens ?? Number(detail.prompt_tokens ?? 0) + Number(detail.completion_tokens ?? 0)),
        cost_usd: Number(detail.cost_usd ?? 0),
        cost_known: Boolean(detail.cost_known),
        cost_coverage: detail.cost_coverage === "complete" || detail.cost_coverage === "partial" ? detail.cost_coverage : "unknown",
        cost_source: String(detail.cost_source ?? "unknown_pricing"),
        usage_source: String(detail.usage_source ?? "unknown"),
        latency_ms: Number(detail.latency_ms ?? 0),
      };
    } catch {
      return undefined;
    }
  }
  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "vi-VN";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) setDraft((current) => `${current}${current.trim() ? " " : ""}${transcript}`);
    };
    recognition.onend = () => { recognitionRef.current = undefined; setListening(false); };
    recognition.onerror = () => { recognitionRef.current = undefined; setListening(false); };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }
  function updateConversation(id: string | undefined) {
    setConversationId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set("conversation", id);
    else next.delete("conversation");
    setSearchParams(next, { replace: true });
  }
  function selectConversation(id: string | undefined) {
    if (running) return;
    updateConversation(id);
    setHistoryOpen(false);
    setOptimistic([]);
    setError(undefined);
    setReceipt(undefined);
    setRunNotice(undefined);
    followRef.current = true;
    setFollowing(true);
    setJumpVisible(false);
  }

  return (
    <div className="chat-workspace">
      {historyOpen ? <button className="chat-history__scrim" type="button" aria-label="Close conversation history" onClick={() => { setHistoryOpen(false); }} /> : null}
      <aside className={`chat-history${historyOpen ? " chat-history--open" : ""}`}>
        <div className="chat-history__header">
          <div><p className="eyebrow">Workspace</p><h2>Conversations</h2></div>
          <Button label="New chat" variant="secondary" size="sm" onClick={() => { selectConversation(undefined); composerRef.current?.focus(); }} />
        </div>
        <label className="chat-history__search">
          <span className="sr-only">Search conversations</span>
          <input type="search" value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); }} placeholder="Search conversations" />
        </label>
        <HelmoraScrollArea className="chat-history__list" aria-label="Conversation history">
          {conversations.isPending ? <ConversationSkeleton /> : filteredConversations.length ? filteredConversations.map((conversation) => (
            <button key={conversation.id} className={conversation.id === conversationId ? "chat-history__item chat-history__item--active" : "chat-history__item"} onClick={() => { selectConversation(conversation.id); }}>
              <span className="chat-history__item-icon" aria-hidden="true">◌</span>
              <span><strong>{conversation.title}</strong><small>{formatTime(conversation.updatedAt)}</small></span>
            </button>
          )) : <p className="muted-copy">{historySearch ? "No matching conversations." : "No conversations yet."}</p>}
        </HelmoraScrollArea>
        <footer className="chat-history__footer"><span>{conversations.data?.data.length ?? 0} recent threads</span><span>Synced with Hub</span></footer>
      </aside>
      <section className="chat-main">
        <header className="chat-toolbar">
          <div className="chat-toolbar__start">
            <button className="chat-history-mobile-toggle" type="button" aria-label="Open conversation history" aria-expanded={historyOpen} onClick={() => { setHistoryOpen(true); }}>☰</button>
            <div className="chat-model-state" aria-label="Current response mode">
              <span className={running ? "chat-model-state__dot chat-model-state__dot--active" : "chat-model-state__dot"} />
              <span>{conversationId ? detail.data?.conversation.title ?? "Conversation" : "New conversation"}</span>
            </div>
          </div>
          <span className="chat-toolbar__hint">{running ? "Helmora is working" : activeModel?.virtual ? "Routed by Helmora" : "Direct model"}</span>
        </header>
        {toolsEnabled ? (
          <div className="agent-ready-bar" role="status">
            <span className="agent-ready-bar__pulse" aria-hidden="true" />
            <strong>Agent mode ready</strong>
            <span>{tools.isPending ? "Loading registered tools…" : tools.error ? "Tool registry unavailable" : `${tools.data?.data.length ?? 0} validated tools available to the model`}</span>
            <button type="button" onClick={() => { setToolsEnabled(false); }}>Use direct chat</button>
          </div>
        ) : null}
        <div className="chat-transcript">
          <HelmoraScrollArea
            className="chat-transcript__scroll"
            aria-label="Conversation messages"
            role="log"
            viewportRef={transcriptViewportRef}
            onScroll={onTranscriptScroll}
          >
            <div aria-busy={running}>
              {detail.isPending && conversationId ? <TranscriptSkeleton /> : visibleMessages.length ? visibleMessages.map((message) => <MessageBubble key={message.id} message={message} />) : (
                <ChatEmpty
                  modelsReady={Boolean(models.data?.data.length)}
                  onPrompt={(prompt) => {
                    setDraft(prompt);
                    requestAnimationFrame(() => { composerRef.current?.focus(); });
                  }}
                />
              )}
              {error ? <RequestError error={error} /> : null}
              {runNotice ? <InlineAlert title="Generation stopped">{runNotice}</InlineAlert> : null}
              {receipt ? <Receipt receipt={receipt} /> : null}
            </div>
          </HelmoraScrollArea>
          {jumpVisible ? <button type="button" className="chat-jump-latest" onClick={jumpToLatest}>Jump to latest</button> : null}
        </div>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}{following ? "" : " Auto-follow paused."}</p>
        <form className="composer" onSubmit={(event) => { void send(event); }}>
          <div className="composer__input">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => { setDraft(event.target.value); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={model ? toolsEnabled ? "Ask Helmora to research, calculate, or fetch…" : "Message Helmora…" : "Configure a routed model to begin"}
              disabled={running || !model}
              rows={1}
              aria-label="Message"
            />
          </div>
          <div className="composer__footer">
            <div className="composer__controls">
              <div className="composer-model" ref={modelPickerRef}>
                <button
                  type="button"
                  className="composer-model__trigger"
                  aria-label={`Model ${activeModel?.displayName ?? (model || "not selected")}`}
                  aria-haspopup="listbox"
                  aria-expanded={modelMenuOpen}
                  disabled={running || models.isPending || !models.data?.data.length}
                  onClick={() => { setModelMenuOpen((open) => !open); }}
                >
                  <span>{activeModel?.displayName ?? (models.isPending ? "Loading models" : "Select model")}</span>
                  {Array.isArray(activeModel?.capabilities) && activeModel.capabilities.includes("reasoning") ? <small>Reasoning</small> : null}
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
                </button>
                {modelMenuOpen ? <div className="composer-model__popover">
                  <label><span className="sr-only">Search models</span><input type="search" autoFocus value={modelSearch} onChange={(event) => { setModelSearch(event.target.value); }} placeholder="Search models and routes" /></label>
                  <div role="listbox" aria-label="Available models">
                    {filteredModels.map((item) => <button key={item.id} type="button" role="option" aria-selected={item.id === model} onClick={() => { setModel(item.id); setModelMenuOpen(false); setModelSearch(""); }}>
                      <span><strong>{item.displayName}</strong><small>{item.virtual ? "Helmora route" : item.owned_by ?? item.id}</small></span>
                      {item.id === model ? <span aria-hidden="true">✓</span> : null}
                    </button>)}
                    {!filteredModels.length ? <p>No models match.</p> : null}
                  </div>
                </div> : null}
              </div>
              <label className={memoryEnabled ? "composer-option composer-option--active" : "composer-option"} title="Memory context">
                <input className="sr-only" type="checkbox" aria-label="Memory" checked={memoryEnabled} disabled={running} onChange={(event) => { setMemoryEnabled(event.target.checked); }} />
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 6.5a3.5 3.5 0 0 1 7 0v7a3.5 3.5 0 0 1-7 0Z" /><path d="M4 8h2.5m7 0H16M4 12h2.5m7 0H16M8 3V1m4 2V1m-4 18v-2m4 2v-2" /></svg>
              </label>
              <label className={toolsEnabled ? "composer-option composer-option--active" : "composer-option"} title="Agent tools">
                <input className="sr-only" type="checkbox" aria-label="Agent tools" checked={toolsEnabled} disabled={running} onChange={(event) => { setToolsEnabled(event.target.checked); }} />
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 3 4.5 4.5-3 3-4.5-4.5Z" /><path d="m9.5 6-6 6a2.1 2.1 0 0 0 3 3l6-6" /><path d="m4.5 14.5 1 1" /></svg>
              </label>
              {receipt?.accounting ? <span className={`composer-cost composer-cost--${receipt.accounting.cost_coverage}`}>{formatRunCost(receipt.accounting)}</span> : null}
            </div>
            <div className="composer__actions">
              <button type="button" className={listening ? "composer-mic composer-mic--active" : "composer-mic"} aria-label={listening ? "Stop voice input" : "Voice input"} aria-pressed={listening} disabled={running || !voiceSupported} onClick={toggleVoice} title={voiceSupported ? "Voice input" : "Voice input is unavailable in this browser"}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" /><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v3m-3 0h6" /></svg>
              </button>
              {running ? <button type="button" className="composer-send composer-send--stop" aria-label="Stop" onClick={stop}><span aria-hidden="true" /></button> : <button type="submit" className="composer-send" aria-label="Send" disabled={!draft.trim() || !model}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5m0 0L6 9m4-4 4 4" /></svg></button>}
            </div>
          </div>
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
  return (
    <article className={`message message--${message.role}${message.pending ? " message--pending" : ""}`}>
      <header>
        {message.role === "assistant" ? <span className="message__avatar" aria-hidden="true">H</span> : null}
        <span>{message.role === "assistant" ? "Helmora" : "You"}</span>
        {message.pending ? <Badge variant="info" label="Working" /> : null}
        {message.role === "assistant" && !message.pending && message.text ? (
          <button className="message__copy" type="button" onClick={() => { void copyResponse(); }}>{copied ? "Copied" : "Copy response"}</button>
        ) : null}
      </header>
      <div className="message__content"><ReactMarkdown components={{ pre: CodeBlock }} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{message.text || "…"}</ReactMarkdown></div>
    </article>
  );
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
function ChatEmpty({ modelsReady, onPrompt }: { modelsReady: boolean; onPrompt: (prompt: string) => void }) {
  return (
    <div className="chat-empty">
      <span className="chat-empty__mark">H</span>
      <p className="eyebrow">Helmora intelligence</p>
      <h2>{modelsReady ? "What are we working on?" : "Connect a model to begin."}</h2>
      <p>{modelsReady ? "Start with a question, or give Helmora tools when the task needs current information or calculation." : "Create a provider connection and route, then return here."}</p>
      {modelsReady ? (
        <div className="chat-starters" aria-label="Prompt starters">
          {STARTER_PROMPTS.map((starter) => <button key={starter.label} type="button" onClick={() => { onPrompt(starter.prompt); }}><span>{starter.label}</span><span aria-hidden="true">↗</span></button>)}
        </div>
      ) : null}
    </div>
  );
}
function Receipt({ receipt }: { receipt: RunReceipt }) {
  const toolCount = receipt.toolRuns?.length ?? 0;
  const sourceCount = receipt.citations?.length ?? 0;
  return (
    <details className="run-receipt">
      <summary>
        <span>Run receipt</span>
        <small>{receipt.accounting ? formatRunCost(receipt.accounting) : toolCount ? `${toolCount} tool ${toolCount === 1 ? "call" : "calls"}` : "Response details"}</small>
      </summary>
      <div className="run-receipt__metrics">
        {receipt.model ? <span>Model <strong>{receipt.model}</strong></span> : null}
        {receipt.accounting ? <span>Cost <strong>{formatRunCost(receipt.accounting)}</strong></span> : null}
        {receipt.accounting ? <span>Tokens <strong>{receipt.accounting.total_tokens.toLocaleString()}</strong></span> : receipt.usage ? <span>Tokens <strong>{receipt.usage.total_tokens.toLocaleString()}</strong></span> : null}
        {receipt.accounting ? <span>Input / output <strong>{receipt.accounting.input_tokens.toLocaleString()} / {receipt.accounting.output_tokens.toLocaleString()}</strong></span> : null}
        {receipt.accounting ? <span>Model requests <strong>{receipt.accounting.requests}</strong></span> : null}
        {receipt.accounting ? <span>Physical attempts <strong>{receipt.accounting.physical_attempts}</strong></span> : null}
        {receipt.accounting ? <span>Pricing <strong>{humanizeTool(receipt.accounting.cost_coverage)}</strong></span> : null}
        {receipt.rounds ? <span>Rounds <strong>{receipt.rounds}</strong></span> : null}
        <span>Tools <strong>{toolCount}</strong></span>
        <span>Sources <strong>{sourceCount}</strong></span>
      </div>
      {receipt.toolRuns?.length ? (
        <ol className="agent-timeline" aria-label="Agent tool activity">
          {receipt.toolRuns.map((run, index) => (
            <li key={String(run.runId ?? run.id ?? index)}>
              <span className="agent-timeline__status" aria-hidden="true">✓</span>
              <span><strong>{humanizeTool(String(run.name ?? run.toolId ?? run.tool_id ?? `Tool ${index + 1}`))}</strong><small>Validated Hub tool</small></span>
              <span>{typeof run.durationMs === "number" ? `${run.durationMs} ms` : "Completed"}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {receipt.citations?.length ? (
        <section className="run-sources">
          <header><strong>Validated sources</strong><span>{sourceCount}</span></header>
          <ol>
            {receipt.citations.map((citation) => (
              <li key={citation.id}>
                <span>{citation.id.replace("source_", "")}</span>
                <a href={citation.url} target="_blank" rel="noreferrer noopener">{citation.title}</a>
                {citation.snippet ? <small>{citation.snippet}</small> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {receipt.responseId || receipt.context ? (
        <details className="run-receipt__technical">
          <summary>Technical details</summary>
          <p>{receipt.responseId ? `Response ${receipt.responseId}` : "Context packed"}{receipt.context ? " · context packed" : ""}</p>
        </details>
      ) : null}
    </details>
  );
}
function ConversationSkeleton() {
  return <div className="chat-skeleton-list" aria-busy="true">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>;
}
function TranscriptSkeleton() {
  return <div className="transcript-skeleton" aria-busy="true"><span /><span /><span /></div>;
}
function humanizeTool(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
function formatRunCost(accounting: UsageAccountingReceipt): string {
  if (accounting.cost_coverage === "unknown") return "Cost unknown";
  const value = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: accounting.cost_usd < 0.01 ? 6 : 4, maximumFractionDigits: accounting.cost_usd < 0.01 ? 6 : 4 }).format(accounting.cost_usd);
  return accounting.cost_coverage === "partial" ? `${value}+ partial` : value;
}
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
