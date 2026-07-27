import { describe, expect, it } from "vitest";
import {
  distanceFromBottom,
  isNearBottom,
  shouldFollowAfterScroll,
  shouldShowJumpToLatest,
  NEAR_BOTTOM_PX,
} from "./chatScrollFollow";

describe("chatScrollFollow", () => {
  it("treats the viewport as near-bottom within the threshold", () => {
    expect(isNearBottom(900, 200, 1100, NEAR_BOTTOM_PX)).toBe(true);
    expect(isNearBottom(800, 200, 1100, NEAR_BOTTOM_PX)).toBe(false);
    expect(distanceFromBottom(800, 200, 1100)).toBe(100);
  });

  it("stops following after the user scrolls upward away from the bottom", () => {
    expect(shouldFollowAfterScroll({
      previouslyFollowing: true,
      scrollTop: 100,
      clientHeight: 200,
      scrollHeight: 1200,
    })).toBe(false);
  });

  it("resumes following when the user returns near the bottom", () => {
    expect(shouldFollowAfterScroll({
      previouslyFollowing: false,
      scrollTop: 980,
      clientHeight: 200,
      scrollHeight: 1200,
    })).toBe(true);
  });

  it("shows Jump to latest only when not following and content is below", () => {
    expect(shouldShowJumpToLatest(true, true)).toBe(false);
    expect(shouldShowJumpToLatest(false, false)).toBe(false);
    expect(shouldShowJumpToLatest(false, true)).toBe(true);
  });

  it("handles invalid geometry without NaN follow decisions", () => {
    expect(isNearBottom(Number.NaN, 200, 1000)).toBe(false);
    expect(Number.isFinite(distanceFromBottom(Number.NaN, Number.NaN, Number.NaN))).toBe(false);
  });
});
