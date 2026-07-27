import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TasksPage } from "./TasksPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("bounded scroll surfaces", () => {
  it("wraps the task event timeline in an independent Helmora scroll region", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v2/tasks/task-1")) {
        return json({
          task: {
            id: "task-1",
            kind: "research",
            status: "completed",
            input: {},
            progress: 1,
            cancelRequested: false,
            createdAt: "2026-07-02T10:00:00.000Z",
            updatedAt: "2026-07-02T10:01:00.000Z",
          },
          events: [
            { sequence: 1, type: "queued", payload: { step: 1 }, createdAt: "2026-07-02T10:00:01.000Z" },
            { sequence: 2, type: "completed", payload: { step: 2 }, createdAt: "2026-07-02T10:01:00.000Z" },
          ],
        });
      }
      if (url.includes("/api/v2/tasks")) {
        return json({
          data: [{
            id: "task-1",
            kind: "research",
            status: "completed",
            input: {},
            progress: 1,
            cancelRequested: false,
            createdAt: "2026-07-02T10:00:00.000Z",
            updatedAt: "2026-07-02T10:01:00.000Z",
          }],
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <TasksPage />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByText("research"));
    expect(await screen.findByLabelText("Task event timeline")).toBeInTheDocument();
    expect(container.querySelector(".task-events__scroll .helmora-scroll__viewport")).toBeTruthy();
    expect(screen.getByText("queued")).toBeInTheDocument();
  });
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
