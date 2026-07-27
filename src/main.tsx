import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./styles/ctrlai-tokens.css";
import "./app/AppShell.css";
import { App } from "./app/App";
import { readBuildId, resolveChunkRecovery } from "./lib/chunkRecovery";

const root = document.getElementById("root");
if (!root) throw new Error("Helmora-Web root element is missing.");

window.addEventListener("vite:preloadError", ((event: Event) => {
  const preload = event as Event & { payload?: unknown; preventDefault(): void };
  const decision = resolveChunkRecovery(preload.payload ?? preload, {
    pathname: window.location.pathname,
    buildId: readBuildId(),
  });
  if (decision === "reload") {
    preload.preventDefault();
    window.location.reload();
  }
  // On "recover", do not preventDefault so React.lazy rejection reaches ChunkErrorBoundary.
}) as EventListener);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
