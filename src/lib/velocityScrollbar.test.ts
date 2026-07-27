import { describe, expect, it } from "vitest";
import {
  averageVelocity,
  baseThumbLength,
  decayStretch,
  hasOverflow,
  smoothVelocity,
  stretchAmount,
  thumbMetrics,
  velocityPxPerMs,
  IDLE_DECAY_MS,
  MAX_THUMB_FRACTION,
  MIN_THUMB_FRACTION,
} from "./velocityScrollbar";

describe("velocityScrollbar math", () => {
  it("reports no-overflow when content fits", () => {
    expect(hasOverflow(400, 400)).toBe(false);
    expect(hasOverflow(400, 399)).toBe(false);
    expect(baseThumbLength(400, 400)).toBe(1);
    expect(thumbMetrics({ clientSize: 400, scrollSize: 400, scrollOffset: 0 }).length).toBe(1);
  });

  it("computes base length with a minimum floor", () => {
    expect(baseThumbLength(200, 1000)).toBe(0.2);
    expect(baseThumbLength(10, 10_000)).toBe(MIN_THUMB_FRACTION);
  });

  it("positions the thumb at start, middle, and end", () => {
    const start = thumbMetrics({ clientSize: 200, scrollSize: 1000, scrollOffset: 0 });
    const middle = thumbMetrics({ clientSize: 200, scrollSize: 1000, scrollOffset: 400 });
    const end = thumbMetrics({ clientSize: 200, scrollSize: 1000, scrollOffset: 800 });
    expect(start.offset).toBe(0);
    expect(middle.offset).toBeCloseTo(0.5 * (1 - middle.length), 5);
    expect(end.offset + end.length).toBeCloseTo(1, 5);
  });

  it("stretches with fast velocity and clamps the maximum length", () => {
    const stretch = stretchAmount(10);
    expect(stretch).toBeGreaterThan(0);
    const metrics = thumbMetrics({ clientSize: 200, scrollSize: 1000, scrollOffset: 0, stretch: 1 });
    expect(metrics.length).toBe(MAX_THUMB_FRACTION);
    expect(metrics.offset).toBe(0);
  });

  it("decays stretch to base over the idle window", () => {
    expect(decayStretch(0.2, 0)).toBeCloseTo(0.2);
    expect(decayStretch(0.2, IDLE_DECAY_MS / 2)).toBeCloseTo(0.1);
    expect(decayStretch(0.2, IDLE_DECAY_MS)).toBe(0);
    expect(decayStretch(0.2, IDLE_DECAY_MS, true)).toBe(0);
  });

  it("handles invalid timing without NaN", () => {
    expect(velocityPxPerMs(40, 0)).toBe(0);
    expect(velocityPxPerMs(Number.NaN, 16)).toBe(0);
    expect(velocityPxPerMs(40, Number.NaN)).toBe(0);
    const metrics = thumbMetrics({
      clientSize: Number.NaN,
      scrollSize: Number.NaN,
      scrollOffset: Number.NaN,
      stretch: Number.NaN,
    });
    expect(Number.isNaN(metrics.length)).toBe(false);
    expect(Number.isNaN(metrics.offset)).toBe(false);
  });

  it("smooths noisy velocity samples with a bounded moving average", () => {
    const samples = smoothVelocity([1, 2, 3, 4, 5], 10);
    expect(samples).toHaveLength(5);
    expect(samples.at(-1)).toBe(10);
    expect(averageVelocity(samples)).toBeCloseTo((2 + 3 + 4 + 5 + 10) / 5);
  });

  it("recomputes length when content size changes", () => {
    const before = thumbMetrics({ clientSize: 200, scrollSize: 1000, scrollOffset: 0 });
    const after = thumbMetrics({ clientSize: 200, scrollSize: 400, scrollOffset: 0 });
    expect(after.baseLength).toBeGreaterThan(before.baseLength);
  });

  it("uses a stable thumb without stretch when reduced motion is requested", () => {
    expect(stretchAmount(8, true)).toBe(0);
    const metrics = thumbMetrics({ clientSize: 200, scrollSize: 1000, scrollOffset: 100, stretch: stretchAmount(8, true) });
    expect(metrics.length).toBe(metrics.baseLength);
  });
});
