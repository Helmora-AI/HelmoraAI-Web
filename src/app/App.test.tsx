import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("App authentication gate", () => {
  it("shows first-run setup when Hub is not initialized", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: "ready", initialized: false, database: "ok", inflight: 1 })));
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Create your control plane" })).toBeInTheDocument();
    expect(screen.getByText(/operation can run only once/i)).toBeInTheDocument();
  });

  it("shows login when Hub is initialized but the session is absent", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/ready") ? jsonResponse({ status: "ready", initialized: true, database: "ok", inflight: 1 }) : jsonResponse({ error: { type: "authentication_error", code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", request_id: "req_auth", retryable: false, retry_after_ms: null } }, 401));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
