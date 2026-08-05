import { Badge, Button, TextInput } from "@astryxdesign/core";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { RequestError } from "../components/InlineAlert";
import { JsonPreview } from "../components/JsonPreview";
import { api } from "../lib/api/client";
import type { FetchedDocument, SearchResponse, TaskRecord } from "../lib/api/types";
import { onTabsKeyDown } from "../lib/tabs";

export function ResearchPage() {
  const [mode, setMode] = useState<"search" | "fetch" | "research">("search");
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [freshness, setFreshness] = useState("");
  const [domains, setDomains] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResponse>();
  const [document, setDocument] = useState<FetchedDocument>();
  const [task, setTask] = useState<TaskRecord>();
  const [taskEvents, setTaskEvents] = useState<string[]>([]);
  const search = useMutation({ mutationFn: () => api.request<SearchResponse>("/api/v2/search", { method: "POST", body: { query, count: 12, ...(freshness ? { freshness } : {}), ...(domains.trim() ? { domains: domains.split(",").map((item) => item.trim()).filter(Boolean) } : {}) } }), onSuccess: setSearchResult });
  const fetchUrl = useMutation({ mutationFn: () => api.request<FetchedDocument>("/api/v2/fetch", { method: "POST", body: { url, maxBytes: 2_000_000 } }), onSuccess: setDocument });
  const deepResearch = useMutation({ mutationFn: () => api.request<TaskRecord>("/api/v2/research", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: { query, maxSources: 10 } }), onSuccess: (created) => { setTask(created); setTaskEvents([]); } });

  useEffect(() => {
    if (!task || ["completed", "failed", "cancelled"].includes(task.status)) return;
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of api.stream<Record<string, unknown>>(`/api/v2/tasks/${encodeURIComponent(task.id)}/events`, { method: "GET", signal: controller.signal })) {
          setTaskEvents((current) => [...current, event.event]);
          if (event.event === "task.terminal") setTask(event.data as unknown as TaskRecord);
        }
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setTaskEvents((current) => [...current, "Live stream interrupted — progress may be stale"]); }
    })();
    return () => { controller.abort(); };
  }, [task?.id, task?.status]);

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (mode === "search") search.mutate(); else if (mode === "fetch") fetchUrl.mutate(); else deepResearch.mutate(); }
  const pending = search.isPending || fetchUrl.isPending || deepResearch.isPending;
  const error = search.error ?? fetchUrl.error ?? deepResearch.error;
  return <div className="page"><section className="page-intro"><div><p className="eyebrow">Retrieval workspace</p><h2>Search broadly. Fetch safely. Research durably.</h2><p>All outbound retrieval passes through Hub’s SSRF boundary, size limits, redirect policy, and configured search provider.</p></div></section>
    <div className="segmented" role="tablist" onKeyDown={(event) => { onTabsKeyDown(event, (index) => { setMode(index === 0 ? "search" : index === 1 ? "fetch" : "research"); }); }}>
      <button role="tab" aria-selected={mode === "search"} tabIndex={mode === "search" ? 0 : -1} onClick={() => { setMode("search"); }}>Search web</button>
      <button role="tab" aria-selected={mode === "fetch"} tabIndex={mode === "fetch" ? 0 : -1} onClick={() => { setMode("fetch"); }}>Fetch URL</button>
      <button role="tab" aria-selected={mode === "research"} tabIndex={mode === "research" ? 0 : -1} onClick={() => { setMode("research"); }}>Deep research</button>
    </div>
    <section className="panel research-form"><form onSubmit={submit}>{mode === "fetch" ? <TextInput label="Public URL" value={url} onChange={setUrl} placeholder="https://example.com/article" isRequired /> : <TextInput label={mode === "research" ? "Research question" : "Search query"} value={query} onChange={setQuery} placeholder={mode === "research" ? "Investigate a topic across several sources…" : "Search the web…"} isRequired />}{mode === "search" ? <><label className="native-field"><span>Freshness</span><select value={freshness} onChange={(event) => { setFreshness(event.target.value); }}><option value="">Any time</option><option value="day">Past day</option><option value="week">Past week</option><option value="month">Past month</option><option value="year">Past year</option></select></label><TextInput label="Domains" value={domains} onChange={setDomains} placeholder="example.com, docs.example.com" isOptional /></> : null}<Button type="submit" label={mode === "search" ? "Search" : mode === "fetch" ? "Fetch safely" : "Start research task"} variant="primary" isLoading={pending} isDisabled={mode === "fetch" ? !url.trim() : !query.trim()} /></form></section>
    {error ? <RequestError error={error} /> : null}
    {mode === "search" && searchResult ? <section className="panel research-results"><header className="panel__header"><div><p className="eyebrow">{searchResult.provider} · {searchResult.tookMs} ms</p><h3>{searchResult.results.length} search results</h3></div></header>{searchResult.results.length ? searchResult.results.map((result) => <article key={result.id}><span>{result.source.slice(0, 2).toUpperCase()}</span><div><a href={result.url} target="_blank" rel="noreferrer">{result.title}</a><p>{result.snippet}</p><small>{result.url}{result.publishedAt ? ` · ${result.publishedAt}` : ""}</small></div></article>) : <p className="muted-copy">No results found. Try a different query, freshness, or domain filter.</p>}</section> : null}
    {mode === "fetch" && document ? <section className="panel fetched-document"><header><div><p className="eyebrow">{document.mediaType} · {document.bytes.toLocaleString()} bytes</p><h3>{document.title}</h3><a href={document.finalUrl} target="_blank" rel="noreferrer">{document.finalUrl}</a></div><Badge variant={document.truncated ? "warning" : "success"} label={document.truncated ? "Truncated" : "Complete"} /></header><pre>{document.text}</pre><footer>{document.links.slice(0, 10).map((link) => <a href={link.url} target="_blank" rel="noreferrer" key={link.url}>{link.text || link.url}</a>)}</footer></section> : null}
    {mode === "research" && task ? <section className="panel task-focus"><header><div><p className="eyebrow">Durable task</p><h3>{task.id}</h3></div><Badge variant={task.status === "completed" ? "success" : task.status === "failed" ? "error" : "info"} label={task.status} /></header><div className="progress" role="progressbar" aria-label="Research task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(4, task.progress * 100))}><i style={{ width: `${Math.max(4, task.progress * 100)}%` }} aria-hidden="true" /></div><p>{taskEvents.length ? taskEvents.join(" → ") : "Waiting for worker events…"}</p>{task.result !== undefined ? <JsonPreview value={task.result} /> : null}</section> : null}
  </div>;
}
