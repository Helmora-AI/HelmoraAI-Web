import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChunkErrorBoundary } from "./ChunkErrorBoundary";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

describe("ChunkErrorBoundary", () => {
  it("triggers at most one guarded reload for a stale chunk failure", () => {
    const reload = vi.fn();
    const storage = sessionStorage;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <ChunkErrorBoundary pathname="/chat" buildId="/assets/index-a.js" reload={reload} storage={storage}>
        <Boom message="Failed to fetch dynamically imported module: /assets/ChatPage-old.js" />
      </ChunkErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    cleanup();
    render(
      <ChunkErrorBoundary pathname="/chat" buildId="/assets/index-a.js" reload={reload} storage={storage}>
        <Boom message="Failed to fetch dynamically imported module: /assets/ChatPage-old.js" />
      </ChunkErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /fresh load/i })).toBeInTheDocument();
    expect(screen.queryByText(/stack|at Boom|TypeError/i)).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("exposes a Reload button on the recovery screen", async () => {
    const reload = vi.fn();
    const storage = sessionStorage;
    storage.setItem("helmora.chunk-reload:/assets/index-a.js:/chat", "1");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ChunkErrorBoundary pathname="/chat" buildId="/assets/index-a.js" reload={reload} storage={storage}>
        <Boom message="Failed to fetch dynamically imported module" />
      </ChunkErrorBoundary>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("does not reload for unrelated render errors", () => {
    const reload = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ChunkErrorBoundary pathname="/chat" buildId="/assets/index-a.js" reload={reload}>
        <Boom message="Cannot read properties of undefined (reading 'map')" />
      </ChunkErrorBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    spy.mockRestore();
  });
});
