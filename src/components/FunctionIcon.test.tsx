import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FUNCTION_ICON_NAMES, FunctionIcon } from "./FunctionIcon";

describe("FunctionIcon", () => {
  it("provides a distinct SVG for every primary navigation function", () => {
    const view = render(<>{FUNCTION_ICON_NAMES.map((name) => <FunctionIcon key={name} name={name} />)}</>);
    const icons = Array.from(view.container.querySelectorAll("svg[data-function-icon]"));

    expect(icons).toHaveLength(15);
    expect(icons.map((icon) => icon.getAttribute("data-function-icon"))).toEqual(FUNCTION_ICON_NAMES);
    expect(icons.every((icon) => icon.children.length > 0)).toBe(true);
  });

  it("keeps navigation icons decorative because every link already has a text label", () => {
    const view = render(<FunctionIcon name="chat" size={20} />);
    const icon = view.container.querySelector("svg");

    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("focusable", "false");
    expect(icon).toHaveAttribute("width", "20");
    expect(icon).toHaveAttribute("height", "20");
  });
});
