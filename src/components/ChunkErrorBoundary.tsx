import { Button } from "@astryxdesign/core";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Brand } from "./Brand";
import { isChunkLoadError, readBuildId, resolveChunkRecovery } from "../lib/chunkRecovery";

interface Props {
  children: ReactNode;
  pathname?: string;
  reload?: () => void;
  storage?: Storage;
  buildId?: string;
}

interface State {
  hasError: boolean;
  message: string;
  reloading: boolean;
}

/**
 * Catches lazy-route chunk failures. Allows one hard reload per build+path,
 * then shows a safe recovery screen instead of a black route shell.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, message: "", reloading: false };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      reloading: false,
      message: isChunkLoadError(error)
        ? "A required script failed to load. Reload to fetch the latest Helmora build."
        : "Something went wrong while preparing this workspace.",
    };
  }

  public override componentDidCatch(error: Error, _info: ErrorInfo): void {
    if (!isChunkLoadError(error)) return;
    const pathname = this.props.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
    const buildId = this.props.buildId ?? readBuildId();
    const decision = resolveChunkRecovery(error, {
      pathname,
      buildId,
      ...(this.props.storage ? { storage: this.props.storage } : {}),
    });
    if (decision === "reload") {
      this.setState({ reloading: true });
      (this.props.reload ?? (() => { window.location.reload(); }))();
    }
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.state.reloading) {
        return <main className="route-loader" aria-busy="true"><span /><p>Refreshing workspace</p></main>;
      }
      return (
        <main className="offline-screen" role="alert" aria-live="assertive">
          <Brand />
          <p className="eyebrow">Workspace recovery</p>
          <h1>This page needs a fresh load.</h1>
          <p>{this.state.message}</p>
          <Button
            label="Reload"
            variant="primary"
            onClick={() => { (this.props.reload ?? (() => { window.location.reload(); }))(); }}
          />
        </main>
      );
    }
    return this.props.children;
  }
}
