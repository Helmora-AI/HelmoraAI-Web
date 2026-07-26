import { Button, TextInput } from "@astryxdesign/core";
import { useState, type FormEvent } from "react";
import { RequestError } from "../../components/InlineAlert";
import { AuthFrame } from "./AuthFrame";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try { await login({ username, password }); }
    catch (cause) { setPassword(""); setError(cause); }
    finally { setBusy(false); }
  }

  return (
    <AuthFrame eyebrow="Administrator access" title="Welcome back" description="Sign in to this Helmora Hub. Your session stays in a secure HttpOnly cookie.">
      <form className="auth-form" onSubmit={(event) => { void submit(event); }}>
        <TextInput label="Username" value={username} onChange={setUsername} htmlName="username" isRequired />
        <TextInput label="Password" type="password" value={password} onChange={setPassword} htmlName="password" isRequired />
        {error ? <RequestError error={error} /> : null}
        <Button type="submit" label="Sign in to Helmora" variant="primary" width="100%" isLoading={busy} isDisabled={!username.trim() || !password} />
      </form>
    </AuthFrame>
  );
}
