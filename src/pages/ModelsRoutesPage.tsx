import { Badge, Button, TextInput } from "@astryxdesign/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { InlineAlert, RequestError } from "../components/InlineAlert";
import { api } from "../lib/api/client";
import type {
  ConnectionImportModelsResponse,
  ConnectionValidation,
  ListResponse,
  ModelDefinition,
  ProviderConnection,
  ProvidersResponse,
  RouteProfile,
} from "../lib/api/types";
import {
  DISCOVER_PAGE_SIZE,
  connectionsForProvider,
  existingUpstreamIdsForProvider,
  filterCatalogModels,
  filterDiscoveredModels,
  isEnvironmentManagedRevision,
  pageSlice,
  selectableNewModels,
  type DiagnoseState,
} from "../lib/modelDiscovery";
import { buildModelUpsertBody, type ModelDraft } from "../lib/modelUpsert";

export type { ModelDraft };
export { buildModelUpsertBody } from "../lib/modelUpsert";

interface RouteDraft { id: string; strategy: string; modelId: string; connectionId: string; priority: string; }

const MODEL_EMPTY: ModelDraft = { id: "", providerId: "", upstreamId: "", displayName: "", family: "", contextWindow: "128000", maxOutputTokens: "8192", tools: true, reasoning: false, embeddings: false };
const ROUTE_EMPTY: RouteDraft = { id: "helmora-auto", strategy: "balanced", modelId: "", connectionId: "", priority: "10" };

export function modelRegistrationProviders(providers: ProvidersResponse["providers"] | undefined) {
  return (providers ?? []).filter((provider) => provider.availability === "active" && provider.enabled !== false);
}

export function draftFromModel(model: ModelDefinition): ModelDraft {
  return {
    id: model.id,
    providerId: model.providerId,
    upstreamId: model.upstreamId,
    displayName: model.displayName,
    family: model.family,
    contextWindow: String(model.contextWindow),
    maxOutputTokens: String(model.maxOutputTokens),
    tools: model.capabilities.tools,
    reasoning: model.capabilities.reasoning,
    embeddings: model.capabilities.embeddings,
    catalogRevision: model.catalogRevision,
  };
}

export function deleteModelConfirmMessage(model: Pick<ModelDefinition, "id" | "catalogRevision">): string {
  const lines = [
    `Hard-delete model “${model.id}” from the catalog?`,
    "Route targets that reference this model will be removed. Route profiles themselves remain.",
  ];
  if (isEnvironmentManagedRevision(model.catalogRevision)) {
    lines.push("This model looks environment-managed and may reappear after Hub restart if the related env vars are still set.");
  }
  return lines.join("\n\n");
}

export function ModelsRoutesPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"models" | "routes">("models");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [editingOriginal, setEditingOriginal] = useState<ModelDefinition | undefined>();
  const [modelDraft, setModelDraft] = useState<ModelDraft>(MODEL_EMPTY);
  const [routeDraft, setRouteDraft] = useState<RouteDraft>(ROUTE_EMPTY);
  const [simulateId, setSimulateId] = useState("");
  const [simulation, setSimulation] = useState<Record<string, unknown>>({});
  const [catalogQuery, setCatalogQuery] = useState("");
  const [discoverProviderId, setDiscoverProviderId] = useState("");
  const [discoverConnectionId, setDiscoverConnectionId] = useState("");
  const [diagnose, setDiagnose] = useState<DiagnoseState | undefined>();
  const [importResult, setImportResult] = useState<ConnectionImportModelsResponse | undefined>();
  const [modelSearch, setModelSearch] = useState("");
  const [modelPage, setModelPage] = useState(0);
  const discoverConnectionIdRef = useRef(discoverConnectionId);
  discoverConnectionIdRef.current = discoverConnectionId;

  const models = useQuery({ queryKey: ["models"], queryFn: () => api.request<ListResponse<ModelDefinition>>("/api/v2/models") });
  const routes = useQuery({ queryKey: ["routes"], queryFn: () => api.request<ListResponse<RouteProfile>>("/api/v2/routes") });
  const providers = useQuery({ queryKey: ["providers"], queryFn: () => api.request<ProvidersResponse>("/api/v2/providers") });
  const activeProviders = useMemo(() => modelRegistrationProviders(providers.data?.providers), [providers.data?.providers]);
  const discoverConnections = useMemo(
    () => connectionsForProvider(providers.data?.connections ?? [], discoverProviderId),
    [providers.data?.connections, discoverProviderId],
  );

  useEffect(() => {
    if (!modelDraft.providerId || editingId) return;
    if (!activeProviders.some((provider) => provider.id === modelDraft.providerId)) {
      setModelDraft((current) => ({ ...current, providerId: "" }));
    }
  }, [activeProviders, modelDraft.providerId, editingId]);

  useEffect(() => {
    setDiagnose(undefined);
    setImportResult(undefined);
    setModelSearch("");
    setModelPage(0);
    setDiscoverConnectionId("");
  }, [discoverProviderId]);

  useEffect(() => {
    setDiagnose(undefined);
    setImportResult(undefined);
    setModelSearch("");
    setModelPage(0);
  }, [discoverConnectionId]);

  const createOrUpdateModel = useMutation({
    mutationFn: (input: ModelDraft) => {
      if (!activeProviders.some((provider) => provider.id === input.providerId) && !editingId) {
        throw new Error("Provider is not available for model registration.");
      }
      const body = buildModelUpsertBody(input, editingOriginal);
      return api.request<ModelDefinition>("/api/v2/models", { method: "POST", body });
    },
    onSuccess: async () => {
      setModelDraft(MODEL_EMPTY);
      setShowForm(false);
      setEditingId(undefined);
      setEditingOriginal(undefined);
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });
  const disableModel = useMutation({ mutationFn: (id: string) => api.request<{ updated: boolean }>(`/api/v2/models/${encodeURIComponent(id)}`, { method: "PATCH", body: { enabled: false } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["models"] }) });
  const enableModel = useMutation({ mutationFn: (id: string) => api.request<{ updated: boolean }>(`/api/v2/models/${encodeURIComponent(id)}`, { method: "PATCH", body: { enabled: true } }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["models"] }) });
  const deleteModel = useMutation({
    mutationFn: (id: string) => api.request<{ deleted: boolean }>(`/api/v2/models/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["models"] }),
        queryClient.invalidateQueries({ queryKey: ["routes"] }),
      ]);
    },
  });
  const createRoute = useMutation({ mutationFn: (input: RouteDraft) => api.request<{ id: string }>("/api/v2/routes", { method: "POST", body: { id: input.id, strategy: input.strategy, targets: [{ modelId: input.modelId, connectionId: input.connectionId, priority: Number(input.priority) }] } }), onSuccess: async () => { setRouteDraft(ROUTE_EMPTY); setShowForm(false); await queryClient.invalidateQueries({ queryKey: ["routes"] }); } });
  const deleteRoute = useMutation({ mutationFn: (id: string) => api.request<{ deleted: boolean }>(`/api/v2/routes/${encodeURIComponent(id)}`, { method: "DELETE" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["routes"] }) });
  const simulate = useMutation({ mutationFn: (id: string) => api.request<Record<string, unknown>>("/api/v2/routes/simulate", { method: "POST", body: { model: id, input: "Route simulation from Helmora Web" } }), onSuccess: setSimulation });

  const diagnoseMutation = useMutation({
    mutationFn: (id: string) => api.request<ConnectionValidation>(`/api/v2/connections/${encodeURIComponent(id)}/test`, { method: "POST", body: {} }),
    onSuccess: (result, id) => {
      if (id !== discoverConnectionIdRef.current) return;
      setImportResult(undefined);
      setModelSearch("");
      setModelPage(0);
      setDiagnose({ connectionId: id, result, selectedUpstreamIds: [] });
    },
  });
  const importMutation = useMutation({
    mutationFn: ({ id, models: ids }: { id: string; models: string[] }) => api.request<ConnectionImportModelsResponse>(`/api/v2/connections/${encodeURIComponent(id)}/import-models`, { method: "POST", body: { models: ids } }),
    onSuccess: async (result) => {
      if (result.connectionId !== discoverConnectionIdRef.current) return;
      setImportResult(result);
      setDiagnose((current) => current && current.connectionId === result.connectionId ? { ...current, selectedUpstreamIds: [] } : current);
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });

  const error = createOrUpdateModel.error ?? disableModel.error ?? enableModel.error ?? deleteModel.error ?? createRoute.error ?? deleteRoute.error ?? simulate.error ?? diagnoseMutation.error ?? importMutation.error;
  const modelSubmitDisabled = !modelDraft.providerId || !modelDraft.upstreamId || Number(modelDraft.contextWindow) < 1 || Number(modelDraft.maxOutputTokens) < 1 || (!editingId && !activeProviders.some((provider) => provider.id === modelDraft.providerId));
  const enabledModels = useMemo(() => (models.data?.data ?? []).filter((item) => item.enabled !== false), [models.data?.data]);
  const filteredCatalog = useMemo(() => filterCatalogModels(models.data?.data ?? [], catalogQuery), [models.data?.data, catalogQuery]);
  const activeDiagnose = diagnose && diagnose.connectionId === discoverConnectionId ? diagnose : undefined;
  const activeImport = importResult && importResult.connectionId === discoverConnectionId ? importResult : undefined;
  const existingUpstream = useMemo(
    () => existingUpstreamIdsForProvider(models.data?.data ?? [], discoverProviderId),
    [models.data?.data, discoverProviderId],
  );
  const filteredDiscover = useMemo(
    () => filterDiscoveredModels(activeDiagnose?.result.discoveredModels ?? [], modelSearch),
    [activeDiagnose?.result.discoveredModels, modelSearch],
  );
  const selectableNew = useMemo(() => selectableNewModels(filteredDiscover, existingUpstream), [filteredDiscover, existingUpstream]);
  const pagedModels = pageSlice(filteredDiscover, modelPage);
  const pageCount = Math.max(1, Math.ceil(filteredDiscover.length / DISCOVER_PAGE_SIZE));
  const createdCount = activeImport?.results.filter((item) => item.status === "created").length ?? 0;
  const skippedCount = activeImport?.results.filter((item) => item.status === "skipped_existing").length ?? 0;
  const discoverBusy = diagnoseMutation.isPending || importMutation.isPending;

  function submitModel(event: FormEvent<HTMLFormElement>) { event.preventDefault(); createOrUpdateModel.mutate(modelDraft); }
  function submitRoute(event: FormEvent<HTMLFormElement>) { event.preventDefault(); createRoute.mutate(routeDraft); }
  function setModelField<K extends keyof ModelDraft>(key: K, value: ModelDraft[K]) { setModelDraft((current) => ({ ...current, [key]: value })); }
  function setRouteField(key: keyof RouteDraft, value: string) { setRouteDraft((current) => ({ ...current, [key]: value })); }
  function startEdit(model: ModelDefinition) {
    setEditingId(model.id);
    setEditingOriginal(model);
    setModelDraft(draftFromModel(model));
    setShowForm(true);
    setView("models");
  }
  function startCreate() {
    setEditingId(undefined);
    setEditingOriginal(undefined);
    setModelDraft(MODEL_EMPTY);
    setShowForm((value) => !value);
  }

  function toggleUpstream(id: string, checked: boolean) {
    if (existingUpstream.has(id)) return;
    setDiagnose((current) => {
      if (!current || current.connectionId !== discoverConnectionId) return current;
      const selected = new Set(current.selectedUpstreamIds);
      if (checked) selected.add(id);
      else selected.delete(id);
      return { ...current, selectedUpstreamIds: [...selected] };
    });
  }

  return <div className="page">
    <section className="page-intro"><div><p className="eyebrow">Traffic policy</p><h2>Models describe capability. Routes decide reality.</h2><p>Register or discover models, review disabled imports, then attach enabled models to route profiles. Diagnose lists upstream IDs only — it does not Verify or Enable.</p></div><Button label={showForm ? "Close form" : view === "models" ? (editingId ? "Cancel edit" : "Add model") : "Add route"} variant={showForm ? "secondary" : "primary"} onClick={() => { if (view === "models") startCreate(); else { setShowForm((value) => !value); setEditingId(undefined); setEditingOriginal(undefined); } }} /></section>
    <div className="segmented" role="tablist"><button role="tab" aria-selected={view === "models"} onClick={() => { setView("models"); setShowForm(false); setEditingId(undefined); setEditingOriginal(undefined); }}>Model catalog <span>{models.data?.data.length ?? 0}</span></button><button role="tab" aria-selected={view === "routes"} onClick={() => { setView("routes"); setShowForm(false); setEditingId(undefined); setEditingOriginal(undefined); }}>Route profiles <span>{routes.data?.data.length ?? 0}</span></button></div>

    {view === "models" ? <section className="panel create-panel discover-panel">
      <header><p className="eyebrow">Add / discover</p><h3>Diagnose a connection and import upstream model IDs</h3></header>
      <div className="form-grid form-grid--three">
        <label className="native-field"><span>Diagnose provider</span><select value={discoverProviderId} disabled={discoverBusy} onChange={(event) => { setDiscoverProviderId(event.target.value); }}><option value="">Select provider…</option>{activeProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.display_name}</option>)}</select></label>
        <label className="native-field"><span>Diagnose connection</span><select value={discoverConnectionId} disabled={!discoverProviderId || discoverBusy} onChange={(event) => { setDiscoverConnectionId(event.target.value); }}><option value="">Select connection…</option>{discoverConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></label>
        <div className="form-grid__action"><Button label="Diagnose" variant="secondary" isLoading={diagnoseMutation.isPending} isDisabled={!discoverConnectionId || discoverBusy} onClick={() => { if (discoverConnectionId) diagnoseMutation.mutate(discoverConnectionId); }} /></div>
      </div>
      {discoverProviderId && discoverConnections.length === 0 ? <InlineAlert title="No connections for this provider yet." tone="info"><p className="muted-copy">Create one on the <Link className="text-link" to="/providers">Providers</Link> page, then return here to Diagnose.</p></InlineAlert> : null}
      {activeDiagnose ? <div className="diagnose-result">
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
              <span>{activeDiagnose.selectedUpstreamIds.length} selected · {selectableNew.length} new</span>
              <div className="discover-picker__actions">
                <Button label="Select all filtered new models" size="sm" variant="ghost" isDisabled={discoverBusy} onClick={() => { setDiagnose((current) => current && current.connectionId === discoverConnectionId ? { ...current, selectedUpstreamIds: selectableNew } : current); }} />
                <Button label="Clear selection" size="sm" variant="ghost" isDisabled={discoverBusy} onClick={() => { setDiagnose((current) => current && current.connectionId === discoverConnectionId ? { ...current, selectedUpstreamIds: [] } : current); }} />
              </div>
            </div>
            <ul className="discover-picker__list" role="listbox" aria-label="Discovered models">
              {pagedModels.map((id) => {
                const imported = existingUpstream.has(id);
                const checked = activeDiagnose.selectedUpstreamIds.includes(id);
                return <li key={id}><label className={imported ? "discover-picker__row discover-picker__row--disabled" : "discover-picker__row"} title={id}><input type="checkbox" checked={imported ? true : checked} disabled={imported || discoverBusy} onChange={(event) => { toggleUpstream(id, event.target.checked); }} /><span className="discover-picker__id">{id}</span>{imported ? <Badge variant="neutral" label="Already imported" /> : null}</label></li>;
              })}
            </ul>
            {pageCount > 1 ? <div className="discover-picker__pager"><Button label="Previous" size="sm" variant="ghost" isDisabled={modelPage <= 0 || discoverBusy} onClick={() => { setModelPage((page) => Math.max(0, page - 1)); }} /><span>Page {modelPage + 1} / {pageCount}</span><Button label="Next" size="sm" variant="ghost" isDisabled={modelPage >= pageCount - 1 || discoverBusy} onClick={() => { setModelPage((page) => Math.min(pageCount - 1, page + 1)); }} /></div> : null}
            <InlineAlert title="Discovery proves only that the provider listed these IDs. It does not prove capability, pricing, streaming, or Verify." tone="warning" />
            <Button label="Import selected" variant="primary" size="sm" isLoading={importMutation.isPending} isDisabled={activeDiagnose.selectedUpstreamIds.length === 0 || discoverBusy} onClick={() => { if (!discoverConnectionId || !activeDiagnose) return; importMutation.mutate({ id: discoverConnectionId, models: activeDiagnose.selectedUpstreamIds }); }} />
          </div>
        ) : null}
      </div> : null}
      {activeImport ? <InlineAlert title={`Imported ${createdCount} model(s); skipped ${skippedCount} existing. Imported models are disabled until you review and Enable them.`} tone="success" /> : null}
    </section> : null}

    {showForm && view === "models" ? <section className="panel create-panel"><header><p className="eyebrow">{editingId ? "Edit catalog model" : "Catalog definition"}</p><h3>{editingId ? "Update model metadata" : "Register a model"}</h3></header><form className="form-grid form-grid--three" onSubmit={submitModel}>
      <label className="native-field"><span>Catalog provider</span><select value={modelDraft.providerId} disabled={Boolean(editingId)} onChange={(event) => { setModelField("providerId", event.target.value); }} required><option value="">Select provider…</option>{activeProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.display_name}</option>)}{editingId && !activeProviders.some((item) => item.id === modelDraft.providerId) ? <option value={modelDraft.providerId}>{modelDraft.providerId}</option> : null}</select></label>
      <TextInput label="Upstream model ID" value={modelDraft.upstreamId} onChange={(value) => { if (!editingId) setModelField("upstreamId", value); }} isRequired isOptional={false} {...(editingId ? { description: "Identity field is locked for existing models." } : {})} />
      <TextInput label="Helmora model ID" value={modelDraft.id} onChange={(value) => { if (!editingId) setModelField("id", value); }} placeholder="provider:model" isOptional={!editingId} {...(editingId ? { description: "Identity field is locked." } : {})} />
      <TextInput label="Display name" value={modelDraft.displayName} onChange={(value) => { setModelField("displayName", value); }} isOptional />
      <TextInput label="Family" value={modelDraft.family} onChange={(value) => { setModelField("family", value); }} isOptional />
      <TextInput label="Context window" value={modelDraft.contextWindow} onChange={(value) => { setModelField("contextWindow", value.replace(/\D/gu, "")); }} isRequired />
      <TextInput label="Max output tokens" value={modelDraft.maxOutputTokens} onChange={(value) => { setModelField("maxOutputTokens", value.replace(/\D/gu, "")); }} isRequired />
      <div className="check-row"><label><input type="checkbox" checked={modelDraft.tools} onChange={(event) => { setModelField("tools", event.target.checked); }} /> Tools</label><label><input type="checkbox" checked={modelDraft.reasoning} onChange={(event) => { setModelField("reasoning", event.target.checked); }} /> Reasoning</label><label><input type="checkbox" checked={modelDraft.embeddings} onChange={(event) => { setModelField("embeddings", event.target.checked); }} /> Embeddings</label></div>
      {editingId && isEnvironmentManagedRevision(modelDraft.catalogRevision) ? <InlineAlert title="Environment-managed revision is preserved on edit. Hard-delete may be reseeded after Hub restart if env vars remain." tone="warning" /> : null}
      <div className="form-grid__action"><Button type="submit" label={editingId ? "Save changes" : "Register model"} variant="primary" isLoading={createOrUpdateModel.isPending} isDisabled={modelSubmitDisabled} /></div>
    </form></section> : null}

    {showForm && view === "routes" ? <section className="panel create-panel"><header><p className="eyebrow">Route profile</p><h3>Create or update a route</h3></header><form className="form-grid" onSubmit={submitRoute}>
      <TextInput label="Route ID" value={routeDraft.id} onChange={(value) => { setRouteField("id", value); }} isRequired />
      <label className="native-field"><span>Strategy</span><select value={routeDraft.strategy} onChange={(event) => { setRouteField("strategy", event.target.value); }}><option value="balanced">Balanced</option><option value="quality">Quality</option><option value="fast">Fast</option><option value="economy">Economy</option><option value="reliable">Reliable</option><option value="local">Local</option></select></label>
      <label className="native-field"><span>Model</span><select value={routeDraft.modelId} onChange={(event) => { const selected = enabledModels.find((item) => item.id === event.target.value); const connection = providers.data?.connections.find((item) => item.provider_id === selected?.providerId); setRouteDraft((current) => ({ ...current, modelId: event.target.value, connectionId: connection?.id ?? "" })); }} required><option value="">Select model…</option>{enabledModels.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label>
      <label className="native-field"><span>Connection</span><select value={routeDraft.connectionId} onChange={(event) => { setRouteField("connectionId", event.target.value); }} required><option value="">Select connection…</option>{connectionOptions(routeDraft.modelId, enabledModels, providers.data?.connections ?? []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <TextInput label="Priority" value={routeDraft.priority} onChange={(value) => { setRouteField("priority", value.replace(/\D/gu, "")); }} isRequired />
      <div className="form-grid__action"><Button type="submit" label="Save route" variant="primary" isLoading={createRoute.isPending} isDisabled={!routeDraft.id || !routeDraft.modelId || !routeDraft.connectionId} /></div>
    </form></section> : null}

    {error ? <RequestError error={error} /> : null}
    {view === "models" ? <>
      <section className="panel provider-toolbar"><TextInput label="Search catalog" value={catalogQuery} onChange={setCatalogQuery} placeholder="ID, provider, display name…" isOptional /></section>
      <ModelsTable
        data={filteredCatalog}
        pending={models.isPending}
        onEdit={startEdit}
        onDisable={(id) => { if (window.confirm(`Disable model “${id}”?`)) disableModel.mutate(id); }}
        onEnable={(id) => { enableModel.mutate(id); }}
        onDelete={(model) => { if (window.confirm(deleteModelConfirmMessage(model))) deleteModel.mutate(model.id); }}
        deletePendingId={deleteModel.isPending ? deleteModel.variables : undefined}
      />
    </> : <RoutesTable data={routes.data?.data ?? []} pending={routes.isPending} simulateId={simulateId} setSimulateId={setSimulateId} simulation={simulation} onSimulate={(id) => { setSimulateId(id); setSimulation({}); simulate.mutate(id); }} onDelete={(id) => { if (window.confirm(`Delete route “${id}”?`)) deleteRoute.mutate(id); }} />}
  </div>;
}

function ModelsTable({ data, pending, onEdit, onDisable, onEnable, onDelete, deletePendingId }: {
  data: ModelDefinition[];
  pending: boolean;
  onEdit: (model: ModelDefinition) => void;
  onDisable: (id: string) => void;
  onEnable: (id: string) => void;
  onDelete: (model: ModelDefinition) => void;
  deletePendingId: string | undefined;
}) {
  return <section className="panel data-panel"><header className="panel__header"><div><p className="eyebrow">Current state</p><h3>Model catalog</h3><p className="muted-copy">Imported models start disabled. Hard delete removes the catalog row globally and cascades route targets.</p></div></header>{pending ? <p className="muted-copy">Loading models…</p> : data.length ? <div className="data-table"><div className="data-table__head"><span>Model</span><span>Capacity</span><span>Capabilities</span><span /></div>{data.map((model) => {
    const enabled = model.enabled !== false;
    return <article key={model.id}><div><strong>{model.displayName}</strong><small>{model.id} · {model.providerId}{isEnvironmentManagedRevision(model.catalogRevision) ? " · env" : ""}</small></div><div><strong>{compactNumber(model.contextWindow)}</strong><small>{compactNumber(model.maxOutputTokens)} output</small></div><div className="tag-row"><Badge variant={enabled ? "success" : "neutral"} label={enabled ? "Enabled" : "Disabled"} /><Badge variant="teal" label="stream" />{model.capabilities.tools ? <Badge variant="blue" label="tools" /> : null}{model.capabilities.reasoning ? <Badge variant="purple" label="reasoning" /> : null}{model.capabilities.embeddings ? <Badge variant="orange" label="embed" /> : null}</div><div className="model-actions"><Button label="Edit" variant="ghost" size="sm" onClick={() => { onEdit(model); }} />{enabled ? <Button label="Disable" variant="secondary" size="sm" onClick={() => { onDisable(model.id); }} /> : <Button label="Enable" variant="secondary" size="sm" onClick={() => { onEnable(model.id); }} />}<Button label="Delete" variant="destructive" size="sm" isLoading={deletePendingId === model.id} onClick={() => { onDelete(model); }} /></div></article>;
  })}</div> : <p className="muted-copy">No models match this filter.</p>}</section>;
}

function RoutesTable({ data, pending, simulateId, setSimulateId, simulation, onSimulate, onDelete }: { data: RouteProfile[]; pending: boolean; simulateId: string; setSimulateId: (value: string) => void; simulation?: Record<string, unknown>; onSimulate: (id: string) => void; onDelete: (id: string) => void }) {
  return <section className="panel data-panel"><header className="panel__header"><div><p className="eyebrow">Current state</p><h3>Routing profiles</h3></div></header>{pending ? <p className="muted-copy">Loading routes…</p> : data.length ? <div className="route-list">{data.map((route) => <article className="route-card" key={route.id}><header><div><h4>{route.name || route.id}</h4><p>{route.id} · revision {route.revision}</p></div><Badge variant={route.enabled ? "success" : "neutral"} label={route.strategy} /></header><ol>{route.targets.map((target) => <li key={`${target.modelId}:${target.connectionId}`}><span>{target.priority}</span><div><strong>{target.modelId}</strong><small>{target.connectionId}</small></div></li>)}</ol><footer><Button label="Simulate" size="sm" variant="secondary" onClick={() => { setSimulateId(route.id); onSimulate(route.id); }} /><Button label="Delete" size="sm" variant="destructive" onClick={() => { onDelete(route.id); }} /></footer>{simulateId === route.id && simulation ? <pre className="json-preview">{JSON.stringify(simulation, null, 2)}</pre> : null}</article>)}</div> : <p className="muted-copy">No route profiles.</p>}</section>;
}

function connectionOptions(modelId: string, models: ModelDefinition[], connections: ProviderConnection[]): ProviderConnection[] {
  const providerId = models.find((item) => item.id === modelId)?.providerId;
  return providerId ? connections.filter((connection) => connection.provider_id === providerId) : connections;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
