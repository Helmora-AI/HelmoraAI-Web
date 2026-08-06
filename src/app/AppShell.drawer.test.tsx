import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { AppProviders, resetAppQueryClient } from "./providers";
import { AuthProvider } from "./auth/AuthContext";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAppQueryClient();
});

describe("AppShell mobile navigation drawer", () => {
  it("makes the off-canvas sidebar inert when closed and manages focus when opened and closed", async () => {
    stubFetch();
    stubMatchMedia(true);

    renderShell();

    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const main = document.querySelector<HTMLElement>(".app-shell__main");
    expect(sidebar).not.toBeNull();
    expect(sidebar).toHaveAttribute("inert");

    const menuButton = document.querySelector<HTMLButtonElement>(".mobile-menu");
    expect(menuButton).not.toBeNull();
    fireEvent.click(menuButton!);

    await waitFor(() => { expect(sidebar).not.toHaveAttribute("inert"); });
    expect(screen.getByRole("link", { name: "Chat" })).toHaveFocus();
    expect(main).toHaveAttribute("inert");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => { expect(sidebar).toHaveAttribute("inert"); });
    expect(menuButton).toHaveFocus();
  });

  it("keeps the sidebar focusable on desktop viewports and labels the latency badge", async () => {
    stubFetch();
    stubMatchMedia(false);

    renderShell();

    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    expect(sidebar).not.toBeNull();
    expect(sidebar).not.toHaveAttribute("inert");

    await waitFor(() => {
      expect(screen.getByRole("img", { name: /checking hub latency|hub round-trip latency/i })).toBeInTheDocument();
    });
  });
});

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/health")) return json({ status: "ok", version: "2.0.0-alpha.1", uptime_seconds: 3 });
    if (url.includes("/api/v2/auth/session")) return json({ principal: { type: "admin", tenantId: "t", userId: "owner", scopes: ["*"] }, csrf_token: "csrf" });
    return json({ data: [] });
  }));
}

function stubMatchMedia(compact: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: compact && query === "(max-width: 820px)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })));
}

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
