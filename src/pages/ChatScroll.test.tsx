import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../app/providers";
import { ChatPage } from "./ChatPage";
import shellCss from "../app/AppShell.css?raw";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatPage scroll boundaries", () => {
  it("bounds history and transcript in independent Helmora scroll regions with a composer", async () => {
    stubChatApis();
    const { container } = render(<MemoryRouter><AppProviders><ChatPage /></AppProviders></MemoryRouter>);
    await screen.findByRole("textbox", { name: "Message" });
    expect(container.querySelector(".chat-workspace")).toBeTruthy();
    expect(container.querySelector(".chat-history__list.helmora-scroll")).toBeTruthy();
    expect(container.querySelector(".chat-transcript .helmora-scroll")).toBeTruthy();
    expect(screen.getAllByRole("log", { name: "Conversation messages" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "Message" })).toBeVisible();
    expect(screen.getByLabelText("Conversation history")).toBeTruthy();
  });

  it("shows Jump to latest after scrolling away and resumes follow on click", async () => {
    stubChatApis({ withHistory: true });
    const { container } = render(
      <MemoryRouter initialEntries={["/?conversation=conv_1"]}>
        <AppProviders><ChatPage /></AppProviders>
      </MemoryRouter>,
    );
    await screen.findByText(/Line 0/u);
    const transcript = container.querySelector(".chat-transcript .helmora-scroll__viewport") as HTMLDivElement;
    expect(transcript).toBeTruthy();
    Object.defineProperty(transcript, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(transcript, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(transcript, "scrollTop", { configurable: true, writable: true, value: 0 });
    fireEvent.scroll(transcript);
    expect(await screen.findByRole("button", { name: "Jump to latest" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Jump to latest" })).not.toBeInTheDocument();
    });
  });

  it("keeps CSS height bounds instead of min-height-only growth", () => {
    expect(shellCss).toMatch(/\.chat-workspace[^{]*\{[^}]*height:\s*calc\(100dvh/);
    expect(shellCss).toMatch(/\.chat-main[^{]*\{[^}]*minmax\(0,\s*1fr\)/);
    expect(shellCss).toMatch(/\.chat-history[^{]*\{[^}]*min-height:\s*0/);
    expect(shellCss).toMatch(/\.chat-transcript__scroll[^{]*\{[^}]*height:\s*100%/);
  });
});

function stubChatApis(options?: { withHistory?: boolean }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/v2/routes/models") {
      return json({ data: [{ id: "mock-route", displayName: "Mock route", capabilities: { modalities: ["text"] } }] });
    }
    if (url.startsWith("/api/v2/conversations?")) {
      return json({
        data: options?.withHistory
          ? [{ id: "conv_1", tenantId: "t", userId: "u", title: "History", activeBranchId: "b", archived: false, metadata: {}, createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z" }]
          : [],
        nextCursor: null,
      });
    }
    if (url.startsWith("/api/v2/conversations/")) {
      return json({
        conversation: { id: "conv_1", tenantId: "t", userId: "u", title: "History", activeBranchId: "b", archived: false, metadata: {}, createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z" },
        messages: Array.from({ length: 12 }, (_, index) => ({
          id: `msg_${index}`,
          conversationId: "conv_1",
          branchId: "b",
          role: index % 2 === 0 ? "user" : "assistant",
          parts: [{ type: "text", text: `Line ${index} ${"x".repeat(40)}` }],
          metadata: {},
          sequence: index + 1,
          createdAt: "2026-07-23T00:00:00.000Z",
        })),
      });
    }
    throw new Error(`Unhandled fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
