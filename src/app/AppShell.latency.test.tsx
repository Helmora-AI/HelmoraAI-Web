import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { AppProviders, resetAppQueryClient } from "./providers";
import { AuthProvider } from "./auth/AuthContext";
import { HUB_LATENCY_POLL_MS } from "../lib/hubLatency";

afterEach(() => {
  vi.unstubAllGlobals();
  resetAppQueryClient();
});

describe("AppShell hub latency badge", () => {
  it("exports the five-second poll contract and probes /health", async () => {
    expect(HUB_LATENCY_POLL_MS).toBe(5_000);
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      paths.push(url);
      if (url.endsWith("/health")) return json({ status: "ok", version: "2.0.0-alpha.1", uptime_seconds: 3 });
      if (url.endsWith("/ready")) return json({ status: "ready", initialized: true, database: "ok", inflight: 0 });
      if (url.includes("/api/v2/auth/session")) return json({ principal: { type: "admin", tenantId: "t", userId: "owner", scopes: ["*"] }, csrf_token: "csrf" });
      return json({ data: [] });
    }));

    renderShell();

    expect(await screen.findByLabelText("Checking Hub latency")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/Hub round-trip latency \d+ ms/i)).toBeInTheDocument();
    });
    expect(paths.some((path) => path.endsWith("/health"))).toBe(true);
    expect(paths.some((path) => path.includes("runtime/status"))).toBe(false);
  });

  it("shows Hub offline after a failed probe without advertising a stale success value", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) return new Response("down", { status: 503 });
      if (url.endsWith("/ready")) return json({ status: "ready", initialized: true, database: "ok", inflight: 0 });
      if (url.includes("/api/v2/auth/session")) return json({ principal: { type: "admin", tenantId: "t", userId: "owner", scopes: ["*"] }, csrf_token: "csrf" });
      return json({ data: [] });
    }));

    renderShell();

    const badge = await screen.findByLabelText("Hub offline");
    expect(within(badge).getByText("Hub offline")).toBeInTheDocument();
    expect(within(badge).queryByText(/\d+ ms/u)).not.toBeInTheDocument();
  });
});

function renderShell() {
  render(
    <AppProviders>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<p>Overview</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </AppProviders>,
  );
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
