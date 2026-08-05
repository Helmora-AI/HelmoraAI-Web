import type { ReactNode } from "react";
import { RequestError } from "./InlineAlert";

export function AsyncList({ error, isPending, loadingLabel = "Loading…", children }: { error: unknown; isPending: boolean; loadingLabel?: string; children: ReactNode }) {
  if (error) return <RequestError error={error} />;
  if (isPending) return (
    <>
      <p className="sr-only" role="status">{loadingLabel}</p>
      <div className="list-skeleton" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div>
    </>
  );
  return <>{children}</>;
}
