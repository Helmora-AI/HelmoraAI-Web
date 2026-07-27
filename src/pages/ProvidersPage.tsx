import { Badge, Button, TextInput, type BadgeVariant } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InlineAlert, RequestError } from "../components/InlineAlert";
import { HelmoraScrollArea } from "../components/HelmoraScrollArea";
import { ProviderIcon, providerIconBadge } from "../components/ProviderIcon";
import { SearchableSelect } from "../components/SearchableSelect";
import { api } from "../lib/api/client";
import type {
  ConnectionImportModelsResponse,
  ConnectionValidation,
  ConnectionVerifySummary,
  ListResponse,
  ModelDefinition,
  ProviderConnection,
  ProviderManifestSummary,
  ProvidersResponse,
} from "../lib/api/types";
import {
  DISCOVER_PAGE_SIZE,
  existingUpstreamIdsForProvider,
  filterDiscoveredModels,
  pageSlice,
  prefillVerifyAfterImport,
  type DiagnoseState,
} from "../lib/modelDiscovery";
import {
  DEFAULT_PROVIDER_FILTERS,
  deriveProtocolOptions,
  deriveSourceOptions,
  filterProviders,
  providerFiltersActive,
  type ProviderFilterState,
} from "../lib/providerFilters";
import { providerCardStatus, type ProviderCardStatus } from "../lib/providerStatus";
import { connectionSearchItem, type HelmoraSearchItem } from "../lib/searchableSelect";

export type { DiagnoseState };
export { existingUpstreamIdsForProvider, filterDiscoveredModels, pageSlice, prefillVerifyAfterImport };
export { providerCardStatus, type ProviderCardStatus };

interface ConnectionDraft {
  name: string;
  baseUrl: string;
  maxConcurrency: string;
  secrets: Record<string, string>;
  fields: Record<string, string>;
}

function buildDraft(provider: ProviderManifestSummary): ConnectionDraft {
  return { name: "Default", baseUrl: provider.allow_custom_base_url ? String(provider.default_base_url ?? "") : "", maxConcurrency: "4", secrets: {}, fields: {} };
}

function prefillVerifyModel(provider: ProviderManifestSummary, connection: ProviderConnection | undefined): string {
  return connection?.verify?.model || provider.default_model || "";
}

const STATUS_META: Record<ProviderCardStatus, { label: string; badge: BadgeVariant }> = {
  blocked: { label: "Blocked", badge: "error" },
  maintenance: { label: "Coming Soon", badge: "info" },
  not_configured: { label: "Not Configured", badge: "neutral" },
  ready: { label: "Ready", badge: "success" },
  attention: { label: "Attention", badge: "warning" },
};

function connectionCompleted(connection: ProviderConnection): boolean {
  return connection.verify?.status === "ok";
}

export function isBaseUrlRequired(provider: Pick<ProviderManifestSummary, "allow_custom_base_url" | "default_base_url"> | undefined): boolean {
  return Boolean(provider?.allow_custom_base_url && !provider.default_base_url);
}

export function availabilityMessage(provider: Pick<ProviderManifestSummary, "availability" | "availability_reason_code" | "display_name">): string {
  if (provider.availability === "blocked") {
    switch (provider.availability_reason_code) {
      case "cookie_session_blocked":
        return "Blocked by Helmora policy: cookie/session adapters are not supported.";
      case "mitm_stealth_blocked":
        return "Blocked by Helmora policy: MITM/stealth adapters are not supported.";
      case "scrape_noauth_blocked":
        return "Blocked by Helmora policy: scrape/no-auth adapters are not supported.";
      default:
        return "Blocked by Helmora security policy.";
    }
  }
  if (provider.availability === "coming_soon") {
    switch (provider.availability_reason_code) {
      case "oauth_not_implemented":
        return "Listed for discovery. OAuth adapter is not implemented yet.";
      case "media_executor_not_implemented":
        return "Listed for discovery. Dedicated media executor is not implemented yet.";
      case "unsupported_protocol":
        return "Listed for discovery. Needs a dedicated protocol adapter before connections are allowed.";
      default:
        return "Listed for discovery. This provider is not connectable yet.";
    }
  }
  return `${provider.display_name} is available.`;
}

export function ProvidersPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ProviderFilterState>(DEFAULT_PROVIDER_FILTERS);
  const [selectedConnection, setSelectedConnection] = useState<Record<string, string>>({});
  const [configuringId, setConfiguringId] = useState<string>();
  const data = useQuery({ queryKey: ["providers"], queryFn: () => api.request<ProvidersResponse>("/api/v2/providers") });
  const providers = data.data?.providers ?? [];
  const connections = data.data?.connections ?? [];
  const filtered = useMemo(() => filterProviders(providers, connections, filters), [providers, connections, filters]);
  const grouped = useMemo(() => new Map(filtered.map((provider) => [provider.id, { provider, connections: connections.filter((connection) => connection.provider_id === provider.id) }])), [filtered, connections]);
  const protocolOptions = useMemo(() => deriveProtocolOptions(providers), [providers]);
  const sourceOptions = useMemo(() => deriveSourceOptions(providers), [providers]);
  const filtersActive = providerFiltersActive(filters);

  const create = useMutation({
    mutationFn: ({ providerId, draft }: { providerId: string; draft: ConnectionDraft }) => {
      const provider = providers.find((item) => item.id === providerId);
      if (!provider || provider.availability !== "active") throw new Error("Provider is not connectable.");
      if (provider.allow_custom_base_url && !provider.default_base_url && !draft.baseUrl.trim()) throw new Error("Base URL is required for this provider.");
      const secret: Record<string, string> = {};
      for (const field of provider.config_fields.filter((item) => item.kind === "secret")) {
        const value = draft.secrets[field.key]?.trim();
        if (value) secret[field.key] = value;
      }
      const config: Record<string, string> = {};
      for (const field of provider.config_fields.filter((item) => item.kind === "string")) {
        const value = draft.fields[field.key]?.trim();
        if (value) config[field.key] = value;
      }
      return api.request<{ id: string; model_import?: string; note?: string }>(`/api/v2/providers/${encodeURIComponent(providerId)}/connections`, {
        method: "POST",
        body: {
          name: draft.name,
          ...(draft.baseUrl.trim() ? { baseUrl: draft.baseUrl.trim() } : {}),
          authType: Object.keys(secret).length ? "api_key" : "none",
          secret,
          ...(Object.keys(config).length ? { config } : {}),
          maxConcurrency: Number(draft.maxConcurrency),
        },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }),
  });
  const verify = useMutation({
    mutationFn: ({ id, model }: { id: string; model: string }) => api.request<{ ok: boolean; verify: ConnectionVerifySummary; connection: ProviderConnection }>(`/api/v2/connections/${encodeURIComponent(id)}/verify`, { method: "POST", body: { model } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }),
  });
  const toggle = useMutation({ mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.request<{ updated: boolean }>(`/api/v2/connections/${encodeURIComponent(id)}`, { method: "PATCH", body: { enabled } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }) });
  const rotate = useMutation({ mutationFn: ({ id, apiKey }: { id: string; apiKey: string }) => api.request<{ rotated: boolean }>(`/api/v2/connections/${encodeURIComponent(id)}/secret`, { method: "PUT", body: { apiKey } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }) });
  const remove = useMutation({ mutationFn: (id: string) => api.request<{ deleted: boolean }>(`/api/v2/connections/${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }) });

  const error = create.error ?? verify.error ?? toggle.error ?? rotate.error ?? remove.error;
  const activeCount = providers.filter((item) => item.availability === "active").length;
  const soonCount = providers.filter((item) => item.availability === "coming_soon").length;
  const blockedCount = providers.filter((item) => item.availability === "blocked").length;

  function selectedConnectionFor(providerId: string, connections: ProviderConnection[]): ProviderConnection | undefined {
    const chosen = selectedConnection[providerId];
    return (chosen ? connections.find((item) => item.id === chosen) : undefined) ?? connections[0];
  }

  const configuringProvider = configuringId ? providers.find((item) => item.id === configuringId) : undefined;
  const configuringConnections = configuringId ? connections.filter((connection) => connection.provider_id === configuringId) : [];
  const configuringInitialId = configuringProvider ? selectedConnectionFor(configuringProvider.id, configuringConnections)?.id : undefined;

  function updateFilter<K extends keyof ProviderFilterState>(key: K, value: ProviderFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Inference supply</p>
          <h2>Providers, connected on your terms.</h2>
          <p>Secrets stay encrypted inside Hub. Diagnose checks connectivity and may list models; Verify is a chat probe required before Enable. Import never runs automatically.</p>
        </div>
      </section>
      <section className="panel provider-toolbar provider-toolbar--detailed">
        <TextInput label="Search catalog" value={filters.search} onChange={(value) => { updateFilter("search", value); }} placeholder="Name, id, source, protocol, capability…" isOptional />
        <label className="native-field"><span>Availability</span><select value={filters.availability} onChange={(event) => { updateFilter("availability", event.target.value as ProviderFilterState["availability"]); }}><option value="all">All ({providers.length})</option><option value="active">Active ({activeCount})</option><option value="coming_soon">Coming Soon ({soonCount})</option><option value="blocked">Blocked ({blockedCount})</option></select></label>
        <label className="native-field"><span>Connection state</span><select value={filters.connectionState} onChange={(event) => { updateFilter("connectionState", event.target.value as ProviderFilterState["connectionState"]); }}><option value="any">Any</option><option value="not_configured">Not configured</option><option value="has_connections">Has connections</option><option value="has_enabled">Has an enabled connection</option><option value="all_disabled">Configured but all connections disabled</option></select></label>
        <label className="native-field"><span>Verification</span><select value={filters.verification} onChange={(event) => { updateFilter("verification", event.target.value as ProviderFilterState["verification"]); }}><option value="any">Any</option><option value="ready">Ready</option><option value="attention">Attention</option></select></label>
        <label className="native-field"><span>Protocol</span><select value={filters.protocol} onChange={(event) => { updateFilter("protocol", event.target.value); }}><option value="">All</option>{protocolOptions.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}</select></label>
        <label className="native-field"><span>Source</span><select value={filters.source} onChange={(event) => { updateFilter("source", event.target.value); }}><option value="">All</option>{sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
        <label className="native-field"><span>Tier</span><select value={filters.tier === "all" ? "all" : String(filters.tier)} onChange={(event) => { const value = event.target.value; updateFilter("tier", value === "all" ? "all" : Number(value) as 1 | 2 | 3); }}><option value="all">All</option><option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option></select></label>
        <div className="provider-toolbar__meta">
          <span>{filtered.length} of {providers.length} providers</span>
          {filtersActive ? <Button label="Clear filters" size="sm" variant="ghost" onClick={() => { setFilters(DEFAULT_PROVIDER_FILTERS); }} /> : null}
        </div>
      </section>
      {error ? <RequestError error={error} /> : null}
      {data.error ? <RequestError error={data.error} /> : data.isPending ? <p className="muted-copy">Loading provider catalog…</p> : filtered.length === 0 ? (
        <InlineAlert title="No providers match these filters" tone="info"><p className="muted-copy">Adjust search or filters, or clear them to see the full catalog.</p></InlineAlert>
      ) : (
        <div className="provider-grid">{[...grouped.values()].map(({ provider, connections: owned }) => <ProviderCard
          key={provider.id}
          provider={provider}
          connections={owned}
          selected={selectedConnectionFor(provider.id, owned)}
          onSelectConnection={(id) => { setSelectedConnection((current) => ({ ...current, [provider.id]: id })); }}
          onConfigure={() => { setConfiguringId(provider.id); }}
          onVerify={(connection, model) => { verify.mutate({ id: connection.id, model }); }}
          verifyPendingId={verify.isPending ? verify.variables?.id : undefined}
          onToggle={(connection) => { toggle.mutate({ id: connection.id, enabled: !connection.enabled }); }}
          togglePendingId={toggle.isPending ? toggle.variables?.id : undefined}
        />)}</div>
      )}
      {configuringProvider ? <ConfigureModal
        provider={configuringProvider}
        connections={configuringConnections}
        initialConnectionId={configuringInitialId}
        onClose={() => { setConfiguringId(undefined); }}
        onSelect={(id) => { setSelectedConnection((current) => ({ ...current, [configuringProvider.id]: id })); }}
        createConnection={(draft) => create.mutateAsync({ providerId: configuringProvider.id, draft })}
        isCreating={create.isPending}
        verifyConnection={(id, model) => verify.mutateAsync({ id, model })}
        isVerifying={verify.isPending}
        lastVerify={verify.data}
        rotateSecret={async (id, apiKey) => { await rotate.mutateAsync({ id, apiKey }); }}
        isRotating={rotate.isPending}
        deleteConnection={(id) => { remove.mutate(id); }}
        error={error}
      /> : null}
    </div>
  );
}

function ProviderCard({ provider, connections, selected, onSelectConnection, onConfigure, onVerify, verifyPendingId, onToggle, togglePendingId }: {
  provider: ProviderManifestSummary;
  connections: ProviderConnection[];
  selected: ProviderConnection | undefined;
  onSelectConnection: (id: string) => void;
  onConfigure: () => void;
  onVerify: (connection: ProviderConnection, model: string) => void;
  verifyPendingId: string | undefined;
  onToggle: (connection: ProviderConnection) => void;
  togglePendingId: string | undefined;
}) {
  const status = providerCardStatus(provider, connections);
  const meta = STATUS_META[status];
  const verifyModel = selected ? prefillVerifyModel(provider, selected) : "";
  const canEnable = selected?.verify?.status === "ok";
  const iconBadge = providerIconBadge(provider.id);
  return (
    <article className={`provider-card provider-card--${status.replace(/_/gu, "-")}`}>
      <div className="provider-card__hero">
        <span className="provider-card__logo"><ProviderIcon providerId={provider.id} iconKey={provider.icon_key} title={provider.display_name} {...(iconBadge ? { badge: iconBadge } : {})} /></span>
        <h3>{provider.display_name}</h3>
        <Badge variant={meta.badge} label={meta.label} />
      </div>
      <p className="provider-card__pill">{provider.id} · Tier {provider.tier} · {provider.protocol}</p>
      <div className="provider-card__body">
        {selected ? (
          <div className="provider-card__badges">
            <Badge variant={connectionCompleted(selected) ? "success" : "neutral"} label={connectionCompleted(selected) ? "Completed" : "Incomplete"} />
            <Badge variant={selected.enabled ? "success" : "neutral"} label={selected.enabled ? "Enabled" : "Disabled"} />
          </div>
        ) : null}
        {connections.length > 1 ? (
          <label className="native-field provider-card__picker"><span>{connections.length} connections</span><select value={selected?.id ?? ""} onChange={(event) => { onSelectConnection(event.target.value); }}>{connections.map((connection) => <option value={connection.id} key={connection.id}>{connection.name}{connection.enabled ? " · enabled" : ""}</option>)}</select></label>
        ) : connections.length === 1 ? <p className="provider-card__note">{connections[0]!.name}</p> : null}
        {selected?.verify ? <p className="provider-card__note"><span className="provider-card__code">{selected.verify.code}</span> · {selected.verify.message}</p> : provider.availability === "active" && selected ? <p className="provider-card__note">Never verified.</p> : null}
      </div>
      <div className="provider-card__footer">
        {provider.availability === "active" ? (
          <>
            <div className="provider-card__actions">
              <Button label="Configure" size="sm" variant="secondary" onClick={onConfigure} />
              <Button label="Verify" size="sm" variant="ghost" isDisabled={!selected || !verifyModel} isLoading={Boolean(selected) && verifyPendingId === selected?.id} onClick={() => { if (selected && verifyModel) onVerify(selected, verifyModel); }} />
              <Button label={selected?.enabled ? "Disable" : "Enable"} size="sm" variant="ghost" isDisabled={!selected || (!selected.enabled && !canEnable)} isLoading={Boolean(selected) && togglePendingId === selected?.id} onClick={() => { if (selected) onToggle(selected); }} />
            </div>
            {selected && !selected.enabled && !canEnable ? <small className="provider-card__hint">Verify before enabling.</small> : null}
          </>
        ) : <p className="provider-card__status-copy">{availabilityMessage(provider)}</p>}
      </div>
    </article>
  );
}

function ConfigureModal({ provider, connections, initialConnectionId, onClose, onSelect, createConnection, isCreating, verifyConnection, isVerifying, lastVerify, rotateSecret, isRotating, deleteConnection, error }: {
  provider: ProviderManifestSummary;
  connections: ProviderConnection[];
  initialConnectionId: string | undefined;
  onClose: () => void;
  onSelect: (id: string) => void;
  createConnection: (draft: ConnectionDraft) => Promise<{ id: string }>;
  isCreating: boolean;
  verifyConnection: (id: string, model: string) => Promise<{ ok: boolean; verify: ConnectionVerifySummary; connection: ProviderConnection }>;
  isVerifying: boolean;
  lastVerify: { ok: boolean; verify: ConnectionVerifySummary; connection: ProviderConnection } | undefined;
  rotateSecret: (id: string, apiKey: string) => Promise<void>;
  isRotating: boolean;
  deleteConnection: (id: string) => void;
  error: unknown;
}) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<string>(initialConnectionId && connections.some((item) => item.id === initialConnectionId) ? initialConnectionId : "new");
  const editing = selection === "new" ? undefined : connections.find((item) => item.id === selection);
  const connectionItems = useMemo((): HelmoraSearchItem[] => {
    const items: HelmoraSearchItem[] = [
      { id: "new", label: "+ New connection", auxiliaryData: { keywords: ["new", "create"] } },
      ...connections.map((connection) => {
        const item = connectionSearchItem(connection);
        return {
          ...item,
          label: `${connection.name}${connection.enabled ? " · enabled" : ""}`,
          auxiliaryData: { keywords: [...(item.auxiliaryData?.keywords ?? []), connection.enabled ? "enabled" : "disabled"] },
        };
      }),
    ];
    return items;
  }, [connections]);
  const [draft, setDraft] = useState<ConnectionDraft>(() => buildDraft(provider));
  const [apiKey, setApiKey] = useState("");
  const [verifyModel, setVerifyModel] = useState(() => prefillVerifyModel(provider, editing));
  const [diagnose, setDiagnose] = useState<DiagnoseState | undefined>();
  const [modelSearch, setModelSearch] = useState("");
  const [modelPage, setModelPage] = useState(0);
  const [importResult, setImportResult] = useState<ConnectionImportModelsResponse | undefined>();
  const baseUrlRequired = isBaseUrlRequired(provider);
  const blocked = provider.availability !== "active";

  const catalog = useQuery({
    queryKey: ["models"],
    queryFn: () => api.request<ListResponse<ModelDefinition>>("/api/v2/models"),
    enabled: Boolean(editing),
  });

  const diagnoseMutation = useMutation({
    mutationFn: (id: string) => api.request<ConnectionValidation>(`/api/v2/connections/${encodeURIComponent(id)}/test`, { method: "POST", body: {} }),
    onSuccess: (result, id) => {
      setImportResult(undefined);
      setModelSearch("");
      setModelPage(0);
      setDiagnose({ connectionId: id, result, selectedUpstreamIds: [] });
    },
  });

  const importMutation = useMutation({
    mutationFn: ({ id, models }: { id: string; models: string[] }) => api.request<ConnectionImportModelsResponse>(`/api/v2/connections/${encodeURIComponent(id)}/import-models`, { method: "POST", body: { models } }),
    onSuccess: async (result) => {
      setImportResult(result);
      setVerifyModel((current) => prefillVerifyAfterImport(result.results, diagnose?.selectedUpstreamIds ?? [], current || provider.default_model || ""));
      setDiagnose((current) => current ? { ...current, selectedUpstreamIds: [] } : current);
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });

  useEffect(() => {
    setDraft(buildDraft(provider));
    setApiKey("");
    setVerifyModel(prefillVerifyModel(provider, editing));
    setDiagnose(undefined);
    setImportResult(undefined);
    setModelSearch("");
    setModelPage(0);
    // Switching connections resets the form so a save never applies a stale draft to the wrong record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      // Bubble phase: Typeahead may have already preventDefault()'d Escape to
      // restore a token or dismiss its menu. Honor that, and treat an open
      // popover menu as owned by Typeahead. (Closed popovers can leave a
      // [role=listbox] node in the DOM — only :popover-open counts.)
      const menuOpen = Boolean(document.querySelector(":popover-open"));
      if (event.defaultPrevented || menuOpen) {
        requestAnimationFrame(() => {
          Array.from(document.querySelectorAll(":popover-open")).forEach((node) => {
            if (node instanceof HTMLElement) {
              try { node.hidePopover(); } catch { /* already closed */ }
            }
          });
        });
        return;
      }

      onClose();
    };
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("keydown", close); };
  }, [onClose]);

  async function persist(): Promise<string | undefined> {
    if (selection === "new") {
      const created = await createConnection(draft);
      setSelection(created.id);
      onSelect(created.id);
      setDiagnose(undefined);
      setImportResult(undefined);
      return created.id;
    }
    if (editing && apiKey.trim()) {
      await rotateSecret(editing.id, apiKey.trim());
      setApiKey("");
      setDiagnose(undefined);
      setImportResult(undefined);
    }
    return editing?.id;
  }

  function handleSave() { void persist().catch(() => { /* surfaced via error prop */ }); }
  function handleSaveAndVerify() {
    void persist()
      .then((id) => { if (id && verifyModel.trim()) return verifyConnection(id, verifyModel.trim()); return undefined; })
      .catch(() => { /* surfaced via error prop */ });
  }

  const saveDisabled = selection === "new" ? !draft.name.trim() || Number(draft.maxConcurrency) < 1 || (baseUrlRequired && !draft.baseUrl.trim()) : false;
  const shownVerify = lastVerify && lastVerify.connection.id === selection ? lastVerify : undefined;
  const activeDiagnose = diagnose && diagnose.connectionId === selection ? diagnose : undefined;
  const existingUpstream = useMemo(
    () => existingUpstreamIdsForProvider(catalog.data?.data ?? [], provider.id),
    [catalog.data?.data, provider.id],
  );
  const filteredModels = useMemo(
    () => filterDiscoveredModels(activeDiagnose?.result.discoveredModels ?? [], modelSearch),
    [activeDiagnose?.result.discoveredModels, modelSearch],
  );
  const pagedModels = pageSlice(filteredModels, modelPage);
  const pageCount = Math.max(1, Math.ceil(filteredModels.length / DISCOVER_PAGE_SIZE));
  const selectableNew = filteredModels.filter((id) => !existingUpstream.has(id));
  const selectedCount = activeDiagnose?.selectedUpstreamIds.length ?? 0;
  const createdCount = importResult?.results.filter((item) => item.status === "created").length ?? 0;
  const skippedCount = importResult?.results.filter((item) => item.status === "skipped_existing").length ?? 0;
  const modalError = error ?? diagnoseMutation.error ?? importMutation.error;

  function toggleUpstream(id: string, checked: boolean) {
    if (existingUpstream.has(id)) return;
    setDiagnose((current) => {
      if (!current || current.connectionId !== selection) return current;
      const selected = new Set(current.selectedUpstreamIds);
      if (checked) selected.add(id);
      else selected.delete(id);
      return { ...current, selectedUpstreamIds: [...selected] };
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-panel modal-panel--wide" role="dialog" aria-modal="true" aria-label={`Configure ${provider.display_name}`}>
        <header><div><p className="eyebrow">Configure</p><h3>{provider.display_name}</h3></div><Button label="Close" variant="ghost" size="sm" onClick={onClose} /></header>
        {blocked ? <InlineAlert title={availabilityMessage(provider)} tone="info" /> : <>
          {connections.length > 0 ? (
            <SearchableSelect
              label="Connection"
              items={connectionItems}
              value={selection}
              onChange={(id) => { setSelection(id || "new"); if (id && id !== "new") onSelect(id); }}
              placeholder="Search connections…"
              emptySearchResultsText="No connections match"
              hasClear={false}
            />
          ) : (
            <label className="native-field connection-picker"><span>Connection</span><select value={selection} onChange={(event) => { setSelection(event.target.value); if (event.target.value !== "new") onSelect(event.target.value); }}><option value="new">+ New connection</option></select></label>
          )}
          {selection === "new" ? (
            <div className="form-grid">
              <TextInput label="Connection name" value={draft.name} onChange={(value) => { setDraft((current) => ({ ...current, name: value })); }} isRequired />
              {provider.allow_custom_base_url ? <TextInput label="Base URL" value={draft.baseUrl} onChange={(value) => { setDraft((current) => ({ ...current, baseUrl: value })); }} placeholder={provider.default_base_url ?? "https://example.com/v1"} isRequired={baseUrlRequired} isOptional={!baseUrlRequired} /> : null}
              {provider.config_fields.map((field) => field.kind === "secret"
                ? <TextInput key={field.key} label={field.label} type="password" value={draft.secrets[field.key] ?? ""} onChange={(value) => { setDraft((current) => ({ ...current, secrets: { ...current.secrets, [field.key]: value } })); }} isRequired={field.required} isOptional={!field.required} {...(field.description ? { description: field.description } : {})} />
                : <TextInput key={field.key} label={field.label} value={draft.fields[field.key] ?? ""} onChange={(value) => { setDraft((current) => ({ ...current, fields: { ...current.fields, [field.key]: value } })); }} isRequired={field.required} isOptional={!field.required} {...(field.placeholder ? { placeholder: field.placeholder } : {})} {...(field.description ? { description: field.description } : {})} />)}
              <TextInput label="Max concurrency" value={draft.maxConcurrency} onChange={(value) => { setDraft((current) => ({ ...current, maxConcurrency: value.replace(/\D/gu, "") })); }} isRequired />
            </div>
          ) : editing ? (
            <div className="connection-summary">
              <p><strong>{editing.name}</strong> · {editing.base_url ?? provider.default_base_url ?? "Default endpoint"}</p>
              <p>{editing.max_concurrency} concurrent · {editing.secret_configured ? "secret configured" : "no secret"} · {editing.enabled ? "enabled" : "disabled"}</p>
              <p>{editing.verify ? `Last verify: ${editing.verify.status}/${editing.verify.code} (${editing.verify.model}) — ${editing.verify.message}` : "Never verified."}</p>
              <TextInput label="Replace API key" type="password" value={apiKey} onChange={(value) => { setApiKey(value); setDiagnose(undefined); setImportResult(undefined); }} placeholder="Leave blank to keep the existing secret" isOptional />
              <div className="diagnose-block">
                <div className="diagnose-block__header">
                  <div>
                    <p className="eyebrow">Diagnose</p>
                    <p className="muted-copy">Connectivity and optional model listing. Does not run chat Verify or enable the connection.</p>
                  </div>
                  <Button
                    label="Diagnose"
                    size="sm"
                    variant="secondary"
                    isLoading={diagnoseMutation.isPending}
                    isDisabled={diagnoseMutation.isPending || importMutation.isPending}
                    onClick={() => { diagnoseMutation.mutate(editing.id); }}
                  />
                </div>
                {activeDiagnose ? (
                  <div className="diagnose-result">
                    <p><span className="provider-card__code">{activeDiagnose.result.code}</span> · {activeDiagnose.result.message}{activeDiagnose.result.latencyMs !== undefined ? ` · ${activeDiagnose.result.latencyMs} ms` : ""}</p>
                    <Badge variant={activeDiagnose.result.ok ? "success" : "error"} label={activeDiagnose.result.discoveryStatus} />
                    {activeDiagnose.result.discoveryStatus === "unsupported" ? <InlineAlert title="Connection is reachable. Model discovery is not supported for this provider." tone="info" /> : null}
                    {activeDiagnose.result.discoveryStatus === "empty" ? <InlineAlert title="Connection is reachable, but no models were returned." tone="info" /> : null}
                    {activeDiagnose.result.discoveryStatus === "failed" ? <InlineAlert title="Model discovery failed. Fix connectivity or credentials, then Diagnose again." tone="error" /> : null}
                    {activeDiagnose.result.discoveredModelsTruncated ? <InlineAlert title="Only the first discovered models are shown." tone="warning" /> : null}
                    {activeDiagnose.result.discoveryStatus === "available" && activeDiagnose.result.discoveredModels?.length ? (
                      <div className="discover-picker">
                        <TextInput label="Search discovered models" value={modelSearch} onChange={(value) => { setModelSearch(value); setModelPage(0); }} isOptional />
                        <div className="discover-picker__toolbar">
                          <span>{selectedCount} selected · {selectableNew.length} new</span>
                          <div className="discover-picker__actions">
                            <Button label="Select all filtered new models" size="sm" variant="ghost" onClick={() => { setDiagnose((current) => current && current.connectionId === selection ? { ...current, selectedUpstreamIds: selectableNew } : current); }} />
                            <Button label="Clear selection" size="sm" variant="ghost" onClick={() => { setDiagnose((current) => current && current.connectionId === selection ? { ...current, selectedUpstreamIds: [] } : current); }} />
                          </div>
                        </div>
                        <HelmoraScrollArea className="discover-picker__list" aria-label="Discovered models" role="listbox">
                          <ul>
                          {pagedModels.map((id) => {
                            const imported = existingUpstream.has(id);
                            const checked = activeDiagnose.selectedUpstreamIds.includes(id);
                            return (
                              <li key={id}>
                                <label className={imported ? "discover-picker__row discover-picker__row--disabled" : "discover-picker__row"} title={id}>
                                  <input type="checkbox" checked={imported ? true : checked} disabled={imported || importMutation.isPending} onChange={(event) => { toggleUpstream(id, event.target.checked); }} />
                                  <span className="discover-picker__id">{id}</span>
                                  {imported ? <Badge variant="neutral" label="Already imported" /> : null}
                                </label>
                              </li>
                            );
                          })}
                          </ul>
                        </HelmoraScrollArea>
                        {pageCount > 1 ? (
                          <div className="discover-picker__pager">
                            <Button label="Previous" size="sm" variant="ghost" isDisabled={modelPage <= 0} onClick={() => { setModelPage((page) => Math.max(0, page - 1)); }} />
                            <span>Page {modelPage + 1} / {pageCount}</span>
                            <Button label="Next" size="sm" variant="ghost" isDisabled={modelPage >= pageCount - 1} onClick={() => { setModelPage((page) => Math.min(pageCount - 1, page + 1)); }} />
                          </div>
                        ) : null}
                        <Button
                          label="Import selected"
                          variant="primary"
                          size="sm"
                          isLoading={importMutation.isPending}
                          isDisabled={selectedCount === 0 || importMutation.isPending || diagnoseMutation.isPending}
                          onClick={() => {
                            if (!editing || !activeDiagnose || activeDiagnose.selectedUpstreamIds.length === 0) return;
                            importMutation.mutate({ id: editing.id, models: activeDiagnose.selectedUpstreamIds });
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {importResult && importResult.connectionId === selection ? (
                  <div className="import-summary">
                    <InlineAlert title={`Imported ${createdCount} model(s); skipped ${skippedCount} existing. Imported models are disabled until reviewed in Models & Routes.`} tone="success" />
                    <Link className="text-link" to="/models">Review imported models</Link>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <TextInput label="Verify model" value={verifyModel} onChange={setVerifyModel} placeholder={provider.default_model ?? "gpt-4o-mini"} isRequired />
          <InlineAlert title="Verify sends a small chat request and may consume quota. Diagnose does not satisfy the Enable gate." tone="warning" />
          {shownVerify ? <InlineAlert title={`${shownVerify.verify.code}: ${shownVerify.verify.message}`} tone={shownVerify.ok ? "success" : "error"} /> : null}
          {modalError ? <RequestError error={modalError} /> : null}
          <div className="modal-actions">
            {editing ? <Button label="Delete connection" variant="destructive" size="sm" onClick={() => { if (window.confirm(`Delete provider connection "${editing.name}"?`)) { deleteConnection(editing.id); onClose(); } }} /> : <span />}
            <div className="modal-actions__primary">
              <Button label="Cancel" variant="ghost" onClick={onClose} />
              <Button label="Save" variant="secondary" isLoading={isCreating || isRotating} isDisabled={saveDisabled} onClick={handleSave} />
              <Button label="Save & Verify" variant="primary" isLoading={isCreating || isRotating || isVerifying} isDisabled={saveDisabled || !verifyModel.trim()} onClick={handleSaveAndVerify} />
            </div>
          </div>
        </>}
      </section>
    </div>
  );
}
