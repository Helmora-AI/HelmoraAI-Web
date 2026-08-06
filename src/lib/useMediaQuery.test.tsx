import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe({ query }: { query: string }) {
  const matches = useMediaQuery(query);
  return <output data-testid="matches">{String(matches)}</output>;
}

interface StubMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

function createMatchMedia(initialMatches: boolean) {
  const listeners = new Set<() => void>();
  const mediaQueryList: StubMediaQueryList = {
    matches: initialMatches,
    media: "(max-width: 820px)",
    addEventListener: (_type, listener) => { listeners.add(listener); },
    removeEventListener: (_type, listener) => { listeners.delete(listener); },
  };
  return {
    mediaQueryList,
    setMatches(value: boolean) {
      mediaQueryList.matches = value;
      listeners.forEach((listener) => listener());
    },
  };
}

describe("useMediaQuery", () => {
  it("returns false when matchMedia is unavailable", () => {
    render(<Probe query="(max-width: 820px)" />);
    expect(screen.getByTestId("matches")).toHaveTextContent("false");
  });

  it("reflects the current match and reacts to change events", () => {
    const mql = createMatchMedia(true);
    vi.stubGlobal("matchMedia", vi.fn(() => mql.mediaQueryList));
    render(<Probe query="(max-width: 820px)" />);
    expect(screen.getByTestId("matches")).toHaveTextContent("true");
    act(() => { mql.setMatches(false); });
    expect(screen.getByTestId("matches")).toHaveTextContent("false");
  });
});
