import { describe, expect, it } from "vitest";
import tokens from "./ctrlai-tokens.css?raw";
import shell from "../app/AppShell.css?raw";

const TEXT_TOKENS = ["text", "muted", "faint"];
const BACKGROUND_TOKENS = ["bg", "surface", "raised", "sidebar"];

function channel(value: string): number {
  const c = parseInt(value, 16) / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex.slice(1, 3)) + 0.7152 * channel(hex.slice(3, 5)) + 0.0722 * channel(hex.slice(5, 7));
}

function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a >= b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

function parseTheme(block: string): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const match of block.matchAll(/--ctrl-([a-z-]+):\s*(#[0-9a-fA-F]{6});/gu)) {
    const [name, value] = [match[1], match[2]];
    if (name !== undefined && value !== undefined) colors[name] = value.toLowerCase();
  }
  return colors;
}

function themeBlocks(source: string): { name: string; colors: Record<string, string> }[] {
  const light = source.match(/:root\s*\{([\s\S]*?)\}/u)?.[1] ?? "";
  const dark = source.match(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\}/u)?.[1] ?? "";
  return [
    { name: "light", colors: parseTheme(light) },
    { name: "dark", colors: parseTheme(dark) },
  ];
}

function fontRemValues(css: string): string[] {
  const values: string[] = [];
  for (const match of css.matchAll(/(?:^|[;{])\s*(?:font|font-size):\s*([^;}]+)/gu)) {
    const declaration = match[1];
    if (declaration === undefined) continue;
    for (const rem of declaration.matchAll(/(\d*\.?\d+)rem/gu)) {
      const value = rem[0];
      if (value !== undefined) values.push(value);
    }
  }
  return values;
}

describe("contrast guard", () => {
  const blocks = themeBlocks(tokens);

  it("defines both themes with the expected text and background tokens", () => {
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(Object.keys(block.colors)).toEqual(expect.arrayContaining([...TEXT_TOKENS, ...BACKGROUND_TOKENS]));
    }
  });

  it.each(blocks.flatMap((block) => TEXT_TOKENS.flatMap((text) => BACKGROUND_TOKENS.map((bg) => [block.name, text, bg] as const))))(
    "%s theme --ctrl-%s on --ctrl-%s meets WCAG AA body-text contrast (4.5:1)",
    (theme, text, background) => {
      const block = blocks.find((entry) => entry.name === theme)!;
      const ratio = contrastRatio(block.colors[text]!, block.colors[background]!);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("keeps a 0.6rem (9.6px) floor on font and font-size declarations", () => {
    const below = fontRemValues(`${tokens}\n${shell}`).filter((value) => Number.parseFloat(value) < 0.6);
    expect(below).toEqual([]);
  });
});
