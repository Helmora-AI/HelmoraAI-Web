import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderIcon } from "./ProviderIcon";

describe("ProviderIcon", () => {
  it("tries the local PNG logo first, with no remote URL", () => {
    const view = render(<ProviderIcon providerId="openai" title="OpenAI" />);
    const img = view.container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("/logo/providers/openai.png");
    expect(img!.getAttribute("src")).not.toMatch(/^https?:\/\//iu);
    view.unmount();
  });

  it("falls back to the local SVG when the PNG fails to load", () => {
    const view = render(<ProviderIcon providerId="anthropic" title="Anthropic" />);
    fireEvent.error(view.container.querySelector("img")!);
    const img = view.container.querySelector("img");
    expect(img!.getAttribute("src")).toBe("/logo/providers/anthropic.svg");
    view.unmount();
  });

  it("falls back to a letter monogram when both PNG and SVG fail, without looping", () => {
    const view = render(<ProviderIcon providerId="totally-unknown-provider" title="Totally Unknown" />);
    fireEvent.error(view.container.querySelector("img")!);
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.querySelector("img")).toBeNull();
    const monogram = view.container.querySelector(".provider-monogram");
    expect(monogram).toBeTruthy();
    expect(monogram!.textContent).toBe("T");
    expect(view.container.innerHTML).not.toMatch(/https?:\/\//iu);
    view.unmount();
  });

  it("uses iconKey for the asset path when provided", () => {
    const view = render(<ProviderIcon providerId="ollama-cloud" iconKey="ollama" title="Ollama Cloud" badge="Cloud" />);
    const img = view.container.querySelector("img");
    expect(img!.getAttribute("src")).toBe("/logo/providers/ollama.png");
    expect(view.container.querySelector(".provider-icon__badge")!.textContent).toBe("Cloud");
    view.unmount();
  });

  it("derives the monogram letter from the title, not the raw provider id", () => {
    const view = render(<ProviderIcon providerId="zzz" title="Kimi" />);
    fireEvent.error(view.container.querySelector("img")!);
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.querySelector(".provider-monogram")!.textContent).toBe("K");
    view.unmount();
  });
});
