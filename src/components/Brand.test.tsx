import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Brand } from "./Brand";

describe("Brand", () => {
  it("uses the full Helmora light and dark assets", () => {
    const view = render(<Brand />);
    const brand = within(view.container).getByRole("img", { name: "Helmora" });
    const assets = brand.querySelectorAll("img");

    expect(assets).toHaveLength(2);
    expect(assets[0]).toHaveAttribute("src", "/logo/helmora_full_black.png");
    expect(assets[1]).toHaveAttribute("src", "/logo/helmora_full_white.png");
  });

  it("uses the icon assets for compact placements", () => {
    const view = render(<Brand compact />);
    const brand = within(view.container).getByRole("img", { name: "Helmora" });
    const assets = brand.querySelectorAll("img");

    expect(brand).toHaveClass("brand--compact");
    expect(assets[0]).toHaveAttribute("src", "/logo/helmora_logo_black.png");
    expect(assets[1]).toHaveAttribute("src", "/logo/helmora_logo_white.png");
  });
});
