import { Button } from "@astryxdesign/core";
import { useState } from "react";

export function SecretReveal({ label, secret, copyLabel = "Copy", copiedLabel = "Copied", size }: { label: string; secret: string; copyLabel?: string; copiedLabel?: string; size?: "sm" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret-field">
      <div><span>{label}</span><code data-sensitive="true">{secret}</code></div>
      <Button label={copied ? copiedLabel : copyLabel} variant="secondary" {...(size ? { size } : {})} onClick={() => { void (async () => { try { await navigator.clipboard.writeText(secret); setCopied(true); } catch { setCopied(false); } })(); }} />
    </div>
  );
}
