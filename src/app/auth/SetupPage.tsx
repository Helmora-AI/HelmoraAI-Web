import { Button, TextInput } from "@astryxdesign/core";
import { useState, type FormEvent } from "react";
import { InlineAlert, RequestError } from "../../components/InlineAlert";
import type { SetupResponse } from "../../lib/api/types";
import { AuthFrame } from "./AuthFrame";
import { useAuth } from "./AuthContext";

interface Credentials { tenantName: string; username: string; password: string; setupToken: string; }

const INITIAL: Credentials = { tenantName: "Personal", username: "admin", password: "", setupToken: "" };

export function SetupPage() {
  const { setup, login } = useAuth();
  const [form, setForm] = useState<Credentials>(INITIAL);
  const [receipt, setReceipt] = useState<SetupResponse>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  function update(key: keyof Credentials, value: string) { setForm((current) => ({ ...current, [key]: value })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try { setReceipt(await setup({ tenantName: form.tenantName, username: form.username, password: form.password, setupToken: form.setupToken.trim() })); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  async function copyKey() {
    if (!receipt) return;
    try { await navigator.clipboard.writeText(receipt.api_key); setCopied(true); }
    catch { setCopied(false); }
  }

  async function continueToHub() {
    setBusy(true);
    setError(undefined);
    try { await login({ username: form.username, password: form.password }); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  if (receipt) {
    return (
      <AuthFrame eyebrow="Setup complete" title="Save your client key" description="This is the only time Helmora will reveal this API key.">
        <div className="receipt">
          <InlineAlert title="Hub initialized" tone="success">Your owner account and default client key are ready.</InlineAlert>
          <div className="secret-field">
            <div><span>Default client API key</span><code data-sensitive="true">{receipt.api_key}</code></div>
            <Button label={copied ? "Copied" : "Copy key"} variant="secondary" onClick={() => { void copyKey(); }} />
          </div>
          <p className="field-help">Store it in a password manager or secret vault. Helmora Web will not save it.</p>
          <label className="acknowledgement"><input type="checkbox" checked={acknowledged} onChange={(event) => { setAcknowledged(event.target.checked); }} /> <span>I saved the API key somewhere secure.</span></label>
          {error ? <RequestError error={error} /> : null}
          <Button label="Continue to control plane" variant="primary" width="100%" isDisabled={!acknowledged} isLoading={busy} onClick={() => { void continueToHub(); }} />
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame eyebrow="First-run setup" title="Create your control plane" description="Initialize the tenant and owner account. This operation can run only once.">
      <form className="auth-form" onSubmit={(event) => { void submit(event); }}>
        <TextInput label="Workspace name" value={form.tenantName} onChange={(value) => { update("tenantName", value); }} htmlName="organization" isRequired />
        <TextInput label="Owner username" value={form.username} onChange={(value) => { update("username", value); }} htmlName="username" description="At least 3 characters" isRequired />
        <TextInput label="Owner password" type="password" value={form.password} onChange={(value) => { update("password", value); }} htmlName="password" description="At least 12 characters" isRequired />
        <TextInput label="Setup token" type="password" value={form.setupToken} onChange={(value) => { update("setupToken", value); }} htmlName="setup-token" description="Required; use at least 32 characters, including on localhost" isRequired />
        {error ? <RequestError error={error} /> : null}
        <Button type="submit" label="Initialize Helmora Hub" variant="primary" width="100%" isLoading={busy} isDisabled={form.username.trim().length < 3 || form.password.length < 12 || form.setupToken.trim().length < 32 || !form.tenantName.trim()} />
      </form>
    </AuthFrame>
  );
}
