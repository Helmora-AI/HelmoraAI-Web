import {
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  type UIEventHandler,
} from "react";
import {
  averageVelocity,
  decayStretch,
  hasOverflow,
  smoothVelocity,
  stretchAmount,
  thumbMetrics,
  velocityPxPerMs,
} from "../lib/velocityScrollbar";

export interface HelmoraScrollAreaProps {
  children: ReactNode;
  className?: string;
  /** Enhanced velocity thumb (vertical). Default true. */
  enhanced?: boolean;
  /** Forwarded to the native scroll viewport. */
  onScroll?: UIEventHandler<HTMLDivElement>;
  /** Accessible name for the scroll region when useful. */
  "aria-label"?: string;
  role?: string;
  tabIndex?: number;
  style?: CSSProperties;
  viewportRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Native overflow scroller with Helmora themed scrollbars.
 * Enhanced mode draws a decorative velocity-responsive thumb and hides the
 * native visual thumb where supported; pointer/keyboard scrolling stay native.
 */
export function HelmoraScrollArea({
  children,
  className,
  enhanced = true,
  onScroll,
  "aria-label": ariaLabel,
  role,
  tabIndex,
  style,
  viewportRef,
}: HelmoraScrollAreaProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const samplesRef = useRef<number[]>([]);
  const lastScrollRef = useRef({ top: 0, time: 0 });
  const stretchRef = useRef(0);
  const idleSinceRef = useRef(0);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reducedMotionRef.current = media.matches; };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const viewport = viewportRef?.current ?? localRef.current;
    if (!viewport || !enhanced) return;

    const update = (timestamp: number) => {
      frameRef.current = 0;
      const clientSize = viewport.clientHeight;
      const scrollSize = viewport.scrollHeight;
      const overflowing = hasOverflow(clientSize, scrollSize);
      const rail = railRef.current;
      const thumb = thumbRef.current;
      if (!rail || !thumb) return;

      if (!overflowing) {
        rail.hidden = true;
        stretchRef.current = 0;
        samplesRef.current = [];
        return;
      }
      rail.hidden = false;

      if (idleSinceRef.current > 0) {
        stretchRef.current = decayStretch(
          stretchRef.current,
          timestamp - idleSinceRef.current,
          reducedMotionRef.current,
        );
      }

      const metrics = thumbMetrics({
        clientSize,
        scrollSize,
        scrollOffset: viewport.scrollTop,
        stretch: stretchRef.current,
      });
      const railSize = rail.clientHeight;
      thumb.style.height = `${Math.round(metrics.length * railSize)}px`;
      thumb.style.transform = `translateY(${Math.round(metrics.offset * railSize)}px)`;

      if (stretchRef.current > 0.001) {
        frameRef.current = requestAnimationFrame(update);
      }
    };

    const schedule = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(update);
    };

    const onViewportScroll = () => {
      const now = performance.now();
      const top = viewport.scrollTop;
      const elapsed = lastScrollRef.current.time ? now - lastScrollRef.current.time : 16;
      const delta = top - lastScrollRef.current.top;
      lastScrollRef.current = { top, time: now };
      idleSinceRef.current = 0;
      if (!reducedMotionRef.current) {
        samplesRef.current = smoothVelocity(samplesRef.current, velocityPxPerMs(delta, elapsed));
        stretchRef.current = stretchAmount(averageVelocity(samplesRef.current), false);
      } else {
        stretchRef.current = 0;
      }
      schedule();
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        if (performance.now() - lastScrollRef.current.time >= 80) {
          idleSinceRef.current = performance.now();
          samplesRef.current = [];
          schedule();
        }
      }, 90);
    };

    viewport.addEventListener("scroll", onViewportScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => schedule());
    observer?.observe(viewport);
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild);
    schedule();

    return () => {
      viewport.removeEventListener("scroll", onViewportScroll);
      observer?.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enhanced, viewportRef]);

  const classes = ["helmora-scroll", enhanced ? "helmora-scroll--enhanced" : "helmora-scroll--native", className]
    .filter(Boolean)
    .join(" ");

  const effectiveTabIndex = tabIndex !== undefined ? tabIndex : (ariaLabel ? 0 : undefined);

  return (
    <div className={classes} style={style}>
      <div
        ref={(node) => {
          localRef.current = node;
          if (viewportRef) (viewportRef as MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className="helmora-scroll__viewport"
        style={{ overflow: "auto" }}
        onScroll={onScroll}
        aria-label={ariaLabel}
        role={role}
        tabIndex={effectiveTabIndex}
      >
        {children}
      </div>
      {enhanced ? (
        <div className="helmora-scroll__rail" ref={railRef} aria-hidden="true" hidden>
          <div className="helmora-scroll__thumb" ref={thumbRef} />
        </div>
      ) : null}
    </div>
  );
}
