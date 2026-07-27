import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HelmoraScrollArea } from "./HelmoraScrollArea";

afterEach(() => {
  cleanup();
});

describe("HelmoraScrollArea", () => {
  it("keeps a native overflow viewport", () => {
    render(
      <HelmoraScrollArea aria-label="Demo scroll" style={{ height: 120 }}>
        <div style={{ height: 400 }}>Long content</div>
      </HelmoraScrollArea>,
    );
    const viewport = screen.getByLabelText("Demo scroll");
    expect(viewport.classList.contains("helmora-scroll__viewport")).toBe(true);
    expect(getComputedStyle(viewport).overflow).toMatch(/auto|scroll/);
  });

  it("renders an aria-hidden enhanced rail without making it a focus target", () => {
    const { container } = render(
      <HelmoraScrollArea enhanced style={{ height: 120 }}>
        <div style={{ height: 400 }}>Long content</div>
      </HelmoraScrollArea>,
    );
    const rail = container.querySelector(".helmora-scroll__rail");
    expect(rail).toBeTruthy();
    expect(rail!.getAttribute("aria-hidden")).toBe("true");
    expect(rail!.getAttribute("tabindex")).toBeNull();
  });

  it("can disable the enhanced rail for short native-only regions", () => {
    const { container } = render(
      <HelmoraScrollArea enhanced={false}>
        <p>Short</p>
      </HelmoraScrollArea>,
    );
    expect(container.querySelector(".helmora-scroll__rail")).toBeNull();
    expect(container.querySelector(".helmora-scroll--native")).toBeTruthy();
  });

  it("makes a named scroll region keyboard-focusable by defaulting tabIndex to 0 when aria-label is provided", () => {
    render(
      <HelmoraScrollArea aria-label="Named scroll region">
        <p>Scrollable content</p>
      </HelmoraScrollArea>,
    );
    const viewport = screen.getByLabelText("Named scroll region");
    expect(viewport.getAttribute("tabindex")).toBe("0");
  });

  it("preserves explicit tabIndex when caller provides one", () => {
    render(
      <HelmoraScrollArea aria-label="Named scroll region" tabIndex={-1}>
        <p>Scrollable content</p>
      </HelmoraScrollArea>,
    );
    const viewport = screen.getByLabelText("Named scroll region");
    expect(viewport.getAttribute("tabindex")).toBe("-1");
  });
});
