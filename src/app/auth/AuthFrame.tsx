import type { ReactNode } from "react";
import { Brand } from "../../components/Brand";

export function AuthFrame({ eyebrow, title, description, children, aside }: { eyebrow: string; title: string; description: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-story" aria-label="About Helmora">
        <Brand />
        <div className="auth-story__copy">
          <p className="eyebrow">Private AI infrastructure</p>
          <h1>One calm control plane for every model.</h1>
          <p>Route, observe, and govern AI traffic without giving up the interfaces your tools already understand.</p>
        </div>
        <div className="auth-story__signal" aria-hidden="true">
          <span>OPENAI</span><i /><span>HELMORA</span><i /><span>ANTHROPIC</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel__brand" aria-hidden="true"><Brand /></div>
        <div className="auth-card">
          <header>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </header>
          {children}
        </div>
        {aside ? <div className="auth-aside">{aside}</div> : null}
      </section>
    </main>
  );
}
