import { describe, expect, it } from "vitest";
import tokens from "./ctrlai-tokens.css?raw";

describe("rounded focus treatment", () => {
  it("keeps a visible keyboard focus rule for interactive controls", () => {
    expect(tokens).toMatch(/:where\(a,\s*button,\s*input,\s*textarea,\s*select,\s*summary\):focus-visible/);
    expect(tokens).toMatch(/outline:\s*2px\s+solid\s+var\(--ctrl-control\)/);
  });

  it("suppresses the square Helmora outline on Astryx TextInput / Typeahead inner controls", () => {
    expect(tokens).toMatch(/\.astryx-text-input[\s\S]{0,120}:focus-visible/);
    expect(tokens).toMatch(/\.astryx-typeahead[\s\S]{0,120}:focus-visible/);
    const suppressBlock = tokens.slice(tokens.indexOf(".astryx-text-input"));
    expect(suppressBlock).toMatch(/outline:\s*none/);
  });

  it("suppresses a second square outline on native-field and composer controls", () => {
    expect(tokens).toMatch(/\.native-field[\s\S]*?:focus-visible/);
    expect(tokens).toMatch(/\.composer\s+textarea:focus-visible/);
    expect(tokens).toMatch(/\.native-field[\s\S]*?outline:\s*none/);
    expect(tokens).toMatch(/\.composer\s+textarea:focus-visible[\s\S]*?outline:\s*none/);
  });
});
