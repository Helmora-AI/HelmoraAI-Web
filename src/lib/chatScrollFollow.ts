/** Smart transcript follow helpers for Chat. */

export const NEAR_BOTTOM_PX = 72;

export function distanceFromBottom(scrollTop: number, clientHeight: number, scrollHeight: number): number {
  if (![scrollTop, clientHeight, scrollHeight].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return Math.max(0, scrollHeight - (scrollTop + clientHeight));
}

export function isNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = NEAR_BOTTOM_PX,
): boolean {
  return distanceFromBottom(scrollTop, clientHeight, scrollHeight) <= threshold;
}

export function shouldFollowAfterScroll(input: {
  previouslyFollowing: boolean;
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  threshold?: number;
}): boolean {
  return isNearBottom(input.scrollTop, input.clientHeight, input.scrollHeight, input.threshold);
}

export function shouldShowJumpToLatest(following: boolean, hasOverflowBelow: boolean): boolean {
  return !following && hasOverflowBelow;
}
