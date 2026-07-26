import { useEffect, useState } from "react";

type LogoStage = "png" | "svg" | "monogram";

function monogramLetter(title: string, providerId: string): string {
  const source = title.trim() || providerId.trim();
  return (source.charAt(0) || "?").toUpperCase();
}

/**
 * Local-only provider identity: tries the curated PNG, then SVG, then falls
 * back to a letter monogram. Each `onError` moves the stage forward exactly
 * once, so a missing asset can never loop.
 *
 * `iconKey` selects the asset stem (may be shared across providers, e.g. Ollama
 * Local/Cloud). Optional `badge` overlays Local/Cloud (or similar) on the mark.
 */
export function ProviderIcon({
  providerId,
  iconKey,
  title,
  badge,
}: {
  providerId: string;
  iconKey?: string;
  title: string;
  badge?: string;
}) {
  const [stage, setStage] = useState<LogoStage>("png");
  const logoId = (iconKey?.trim() || providerId).trim() || providerId;
  useEffect(() => { setStage("png"); }, [logoId]);

  const mark = stage === "monogram"
    ? <span className="provider-monogram" aria-hidden="true">{monogramLetter(title, providerId)}</span>
    : (
      <img
        key={stage}
        className="provider-logo"
        src={`/logo/providers/${encodeURIComponent(logoId)}.${stage}`}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => { setStage((current) => (current === "png" ? "svg" : "monogram")); }}
      />
    );

  return (
    <span className={badge ? "provider-icon provider-icon--badged" : "provider-icon"}>
      {mark}
      {badge ? <span className="provider-icon__badge" aria-hidden="true">{badge}</span> : null}
    </span>
  );
}

export function providerIconBadge(providerId: string): string | undefined {
  if (providerId === "ollama") return "Local";
  if (providerId === "ollama-cloud") return "Cloud";
  return undefined;
}
