import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./styles/ctrlai-tokens.css";
import "./app/AppShell.css";
import { App } from "./app/App";

const root = document.getElementById("root");
if (!root) throw new Error("Helmora-Web root element is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
