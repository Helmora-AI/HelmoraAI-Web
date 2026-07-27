/** Deterministic math for the velocity-responsive scrollbar thumb. */

export interface ThumbMetrics {
  /** Base thumb length as a fraction of the rail (0–1). */
  baseLength: number;
  /** Final length after velocity stretch, still 0–1. */
  length: number;
  /** Thumb start offset as a fraction of the rail (0–1). */
  offset: number;
}

export const MIN_THUMB_FRACTION = 0.12;
export const MAX_THUMB_FRACTION = 0.85;
export const MAX_STRETCH_FRACTION = 0.28;
export const VELOCITY_REF_PX_PER_MS = 2.5;
export const IDLE_DECAY_MS = 250;
export const VELOCITY_SAMPLE_LIMIT = 5;

export function hasOverflow(clientSize: number, scrollSize: number): boolean {
  return Number.isFinite(clientSize) && Number.isFinite(scrollSize) && scrollSize > clientSize + 1;
}

export function baseThumbLength(clientSize: number, scrollSize: number): number {
  if (!hasOverflow(clientSize, scrollSize)) return 1;
  const raw = clientSize / scrollSize;
  if (!Number.isFinite(raw) || raw <= 0) return MIN_THUMB_FRACTION;
  return clamp(raw, MIN_THUMB_FRACTION, 1);
}

export function velocityPxPerMs(deltaPx: number, elapsedMs: number): number {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.abs(deltaPx) / elapsedMs;
}

export function smoothVelocity(samples: readonly number[], next: number, limit = VELOCITY_SAMPLE_LIMIT): number[] {
  const value = Number.isFinite(next) ? Math.max(0, next) : 0;
  const merged = [...samples, value];
  return merged.length > limit ? merged.slice(merged.length - limit) : merged;
}

export function averageVelocity(samples: readonly number[]): number {
  if (!samples.length) return 0;
  let total = 0;
  for (const sample of samples) total += Number.isFinite(sample) ? sample : 0;
  return total / samples.length;
}

export function stretchAmount(velocity: number, reducedMotion = false): number {
  if (reducedMotion || !Number.isFinite(velocity) || velocity <= 0) return 0;
  const ratio = Math.min(1, velocity / VELOCITY_REF_PX_PER_MS);
  return MAX_STRETCH_FRACTION * ratio;
}

export function decayStretch(currentStretch: number, idleMs: number, reducedMotion = false): number {
  if (reducedMotion || !Number.isFinite(currentStretch) || currentStretch <= 0) return 0;
  if (!Number.isFinite(idleMs) || idleMs <= 0) return currentStretch;
  if (idleMs >= IDLE_DECAY_MS) return 0;
  const progress = idleMs / IDLE_DECAY_MS;
  return currentStretch * (1 - progress);
}

export function thumbMetrics(input: {
  clientSize: number;
  scrollSize: number;
  scrollOffset: number;
  stretch?: number;
}): ThumbMetrics {
  const baseLength = baseThumbLength(input.clientSize, input.scrollSize);
  if (!hasOverflow(input.clientSize, input.scrollSize)) {
    return { baseLength: 1, length: 1, offset: 0 };
  }
  const stretch = Number.isFinite(input.stretch) ? Math.max(0, input.stretch ?? 0) : 0;
  const length = clamp(baseLength + stretch, MIN_THUMB_FRACTION, MAX_THUMB_FRACTION);
  const maxScroll = Math.max(1, input.scrollSize - input.clientSize);
  const scrollOffset = Number.isFinite(input.scrollOffset) ? input.scrollOffset : 0;
  const progress = clamp(scrollOffset / maxScroll, 0, 1);
  const offset = clamp(progress * (1 - length), 0, 1 - length);
  return { baseLength, length, offset };
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
