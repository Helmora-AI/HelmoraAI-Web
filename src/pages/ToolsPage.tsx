import { Badge, Button } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InlineAlert, RequestError } from "../components/InlineAlert";
import { JsonPreview } from "../components/JsonPreview";
import { api } from "../lib/api/client";
import { formatDuration } from "../lib/format";
import type { ListResponse, ToolDefinition } from "../lib/api/types";

type ToolRisk = "read" | "network" | "write" | "dangerous" | string;

export function ToolsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [argumentsText, setArgumentsText] = useState("{}");
  const [parseError, setParseError] = useState<string>();
  const [result, setResult] = useState<unknown>();
  const [confirmed, setConfirmed] = useState(false);
  const [manifestUrl, setManifestUrl] = useState("");
  const [importedCount, setImportedCount] = useState<number>();
  const tools = useQuery({
    queryKey: ["tools"],
    queryFn: () => api.request<ListResponse<ToolDefinition>>("/api/v2/tools"),
  });
  const active = useMemo(
    () => tools.data?.data.find((tool) => tool.name === selected),
    [tools.data, selected],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (tools.data?.data ?? []).filter((tool) => {
      if (riskFilter !== "all" && tool.risk !== riskFilter) return false;
      return !needle || `${tool.name} ${tool.description ?? ""}`.toLowerCase().includes(needle);
    });
  }, [riskFilter, search, tools.data?.data]);
  const counts = useMemo(() => {
    const items = tools.data?.data ?? [];
    return {
      total: items.length,
      local: items.filter((tool) => tool.risk === "read").length,
      network: items.filter((tool) => tool.risk === "network").length,
      sensitive: items.filter((tool) => ["write", "dangerous"].includes(tool.risk)).length,
    };
  }, [tools.data?.data]);

  useEffect(() => {
    if (!selected && tools.data?.data[0]) selectTool(tools.data.data[0]);
  }, [selected, tools.data?.data]);

  const run = useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) =>
      api.request<unknown>(`/api/v2/tools/${encodeURIComponent(name)}/run`, {
        method: "POST",
        body: { arguments: args },
      }),
    onSuccess: setResult,
  });
  const importManifest = useMutation({
    mutationFn: (url: string) => api.request<{ manifest_url: string; imported: Array<Record<string, unknown>> }>("/api/v2/tools/import", { method: "POST", body: { url } }),
    onSuccess: async (response) => {
      setImportedCount(response.imported.length);
      setManifestUrl("");
      await queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });
  const removeTool = useMutation({
    mutationFn: (name: string) => api.request<{ deleted: boolean }>(`/api/v2/tools/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: async () => {
      setSelected(undefined);
      setResult(undefined);
      await queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });

  function selectTool(tool: ToolDefinition) {
    setSelected(tool.name);
    setArgumentsText(JSON.stringify(exampleArguments(tool.inputSchema ?? tool.input_schema ?? {}), null, 2));
    setParseError(undefined);
    setResult(undefined);
    setConfirmed(false);
    run.reset();
  }

  function execute() {
    if (!active) return;
    try {
      const parsed: unknown = JSON.parse(argumentsText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Arguments must be a JSON object.");
      }
      setParseError(undefined);
      setResult(undefined);
      run.mutate({ name: active.name, args: parsed as Record<string, unknown> });
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Invalid JSON");
    }
  }

  const requiresConfirmation = Boolean(active && ["write", "dangerous"].includes(active.risk));
  const schema = active?.inputSchema ?? active?.input_schema ?? {};

  return (
    <div className="page page--tools">
      <section className="page-intro tools-intro">
        <div>
          <p className="eyebrow">Agent capability layer</p>
          <h2>Give models useful hands, with clear boundaries.</h2>
          <p>Helmora advertises only registered Hub tools to compatible models, validates every call, and keeps network or write actions visible.</p>
        </div>
        <Button label="Open agent chat" variant="primary" onClick={() => { navigate("/chat?tools=auto"); }} />
      </section>

      <section className="tool-readiness" aria-label="Tool readiness summary">
        <article><span>Registered</span><strong>{counts.total}</strong><small>available to the agent</small></article>
        <article><span>Local read</span><strong>{counts.local}</strong><small>no outbound network</small></article>
        <article><span>Network</span><strong>{counts.network}</strong><small>external data is untrusted</small></article>
        <article><span>Sensitive</span><strong>{counts.sensitive}</strong><small>confirmation required here</small></article>
      </section>

      <section className="panel tool-import">
        <div>
          <p className="eyebrow">SQLite registry</p>
          <h3>Import tools from a public JSON manifest</h3>
          <p>Helmora fetches the contract, validates every endpoint, and stores the tool definition in SQLite. Imported tools can make bounded GET or POST requests; credentials and executable code are never imported.</p>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); if (manifestUrl.trim()) importManifest.mutate(manifestUrl.trim()); }}>
          <label className="native-field">
            <span>Manifest URL</span>
            <input type="url" value={manifestUrl} onChange={(event) => { setManifestUrl(event.target.value); setImportedCount(undefined); }} placeholder="https://example.com/helmora-tools.json" required />
          </label>
          <Button type="submit" label={importManifest.isPending ? "Importing manifest" : "Fetch and save"} variant="primary" isLoading={importManifest.isPending} isDisabled={!manifestUrl.trim()} />
        </form>
        {importManifest.error ? <RequestError error={importManifest.error} /> : null}
        {importedCount !== undefined ? <InlineAlert title={`${importedCount} web tool${importedCount === 1 ? "" : "s"} saved to SQLite.`} tone="success" /> : null}
        <JsonPreview value={{ schema_version: 1, tools: [{ name: "weather_lookup", version: "1", description: "Look up public weather data.", input_schema: { type: "object", required: ["city"], properties: { city: { type: "string" } }, additionalProperties: false }, endpoint: { url: "https://api.example.com/weather", method: "POST" } }] }} label="Manifest format" />
      </section>

      <InlineAlert title="Agent-ready registry" tone="success">
        In Chat, turn on Agent tools. The selected model can then choose an appropriate registered tool and Helmora will return a bounded activity receipt.
      </InlineAlert>

      <div className="master-detail tools-workbench">
        <section className="panel master-list tools-catalog">
          <header className="tools-catalog__header">
            <div><p className="eyebrow">Registry</p><h3>Available tools</h3></div>
            <Badge variant="neutral" label={`${filtered.length} shown`} />
          </header>
          <div className="tools-catalog__filters">
            <label className="native-field">
              <span>Search</span>
              <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder="Name or capability" />
            </label>
            <label className="native-field">
              <span>Risk</span>
              <select value={riskFilter} onChange={(event) => { setRiskFilter(event.target.value); }}>
                <option value="all">All risks</option>
                <option value="read">Local read</option>
                <option value="network">Network</option>
                <option value="write">Write</option>
                <option value="dangerous">Dangerous</option>
              </select>
            </label>
          </div>
          {tools.error ? <RequestError error={tools.error} /> : tools.isPending ? (
            <div className="record-list record-list--loading" aria-busy="true">
              {Array.from({ length: 4 }, (_, index) => <span key={index} className="tool-row-skeleton" />)}
            </div>
          ) : filtered.length ? (
            <div className="record-list">
              {filtered.map((tool) => (
                <button
                  key={tool.name}
                  className={tool.name === selected ? "record-row record-row--active" : "record-row"}
                  onClick={() => { selectTool(tool); }}
                >
                  <span className={`record-row__mark tool-mark tool-mark--${riskTone(tool.risk)}`} aria-hidden="true">{toolGlyph(tool.name)}</span>
                  <span><strong>{humanize(tool.name)}</strong><small>{tool.description ?? "Hub tool"}</small></span>
                  <Badge variant={riskBadge(tool.risk)} label={riskLabel(tool.risk)} />
                </button>
              ))}
            </div>
          ) : <p className="muted-copy">No tools match these filters.</p>}
        </section>

        <section className="panel detail-panel tool-console">
          {!active ? (
            <div className="detail-empty"><span>⌁</span><h3>Select a tool</h3><p>Its contract and safe execution console will appear here.</p></div>
          ) : (
            <>
              <header className="detail-panel__header tool-console__header">
                <div>
                  <p className="eyebrow">Function contract</p>
                  <h3>{humanize(active.name)}</h3>
                  <p><code>{active.name}</code> · {formatDuration(active.timeoutMs)} timeout</p>
                </div>
                <Badge variant={riskBadge(active.risk)} label={`${riskLabel(active.risk)} risk`} />
              </header>
              <div className="tool-console__provenance">
                <Badge variant={active.persisted ? "purple" : "neutral"} label={active.persisted ? "SQLite · web manifest" : "Built-in"} />
                {active.persisted ? <Button label="Remove imported tool" variant="destructive" size="sm" isLoading={removeTool.isPending} onClick={() => { if (window.confirm(`Remove imported tool “${active.name}”?`)) removeTool.mutate(active.name); }} /> : null}
              </div>
              <p className="tool-description">{active.description ?? "No description provided."}</p>
              <SchemaSummary schema={schema} />
              <section className="tool-playground">
                <header>
                  <div><p className="eyebrow">Test console</p><h4>Arguments</h4></div>
                  <button type="button" onClick={() => { setArgumentsText(JSON.stringify(exampleArguments(schema), null, 2)); }}>Reset example</button>
                </header>
                <label className="native-field">
                  <span>JSON object</span>
                  <textarea rows={8} value={argumentsText} onChange={(event) => { setArgumentsText(event.target.value); }} spellCheck={false} />
                </label>
                {parseError ? <p className="field-error">{parseError}</p> : null}
                {requiresConfirmation ? (
                  <label className="tool-confirmation">
                    <input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); }} />
                    <span>I understand this tool can change external state.</span>
                  </label>
                ) : null}
                {run.error ? <RequestError error={run.error} /> : null}
                <div className="tool-playground__actions">
                  <Button label={run.isPending ? "Running tool" : "Run isolated test"} variant="primary" isLoading={run.isPending} isDisabled={requiresConfirmation && !confirmed} onClick={execute} />
                  <span role="status" aria-live="polite">{run.isPending ? "Validating and executing…" : result !== undefined ? "Execution completed." : "No execution yet."}</span>
                </div>
              </section>
              {result !== undefined ? (
                <section className="tool-result">
                  <header><div><p className="eyebrow">Execution result</p><h4>Bounded output</h4></div><Badge variant="success" label="Completed" /></header>
                  <JsonPreview value={result} />
                </section>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SchemaSummary({ schema }: { schema: Record<string, unknown> }) {
  const properties = schema.properties && typeof schema.properties === "object"
    ? Object.entries(schema.properties as Record<string, unknown>)
    : [];
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  return (
    <section className="tool-schema">
      <header><p className="eyebrow">Input schema</p><Badge variant="neutral" label={`${properties.length} fields`} /></header>
      {properties.length ? (
        <div className="tool-schema__fields">
          {properties.map(([name, raw]) => {
            const field = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
            return (
              <article key={name}>
                <code>{name}</code>
                <span>{String(field.type ?? "any")}</span>
                {required.has(name) ? <Badge variant="info" label="Required" /> : <small>Optional</small>}
                {field.description ? <p>{String(field.description)}</p> : null}
              </article>
            );
          })}
        </div>
      ) : <p className="muted-copy">This tool accepts an empty arguments object.</p>}
      <JsonPreview value={schema} label="View raw schema" />
    </section>
  );
}

function exampleArguments(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties && typeof schema.properties === "object"
    ? schema.properties as Record<string, unknown>
    : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  const entries = Object.entries(properties)
    .filter(([name]) => required.has(name))
    .map(([name, raw]) => [name, exampleValue(raw)] as const);
  return Object.fromEntries(entries);
}

function exampleValue(raw: unknown): unknown {
  const field = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  if (field.default !== undefined) return field.default;
  if (Array.isArray(field.enum) && field.enum.length) return field.enum[0];
  if (field.type === "integer" || field.type === "number") return Number(field.minimum ?? 1);
  if (field.type === "boolean") return false;
  if (field.type === "array") return [];
  if (field.type === "object") return {};
  return "";
}

function riskTone(risk: ToolRisk): string {
  if (risk === "network") return "network";
  if (risk === "write" || risk === "dangerous") return "sensitive";
  return "read";
}

function riskBadge(risk: ToolRisk): "neutral" | "info" | "warning" | "error" {
  if (risk === "network") return "info";
  if (risk === "write") return "warning";
  if (risk === "dangerous") return "error";
  return "neutral";
}

function riskLabel(risk: ToolRisk): string {
  if (risk === "read") return "Local read";
  return humanize(risk);
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function toolGlyph(name: string): string {
  if (name.includes("search")) return "⌕";
  if (name.includes("fetch")) return "↗";
  if (name.includes("time")) return "◷";
  if (name.includes("calculator")) return "∑";
  return "⌁";
}
