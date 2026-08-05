/// <reference types="vite/client" />
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/reducedMotion";

interface NumericParts {
  prefix: string;
  suffix: string;
  decimals: number;
  group: boolean;
}

export function parseNumeric(text: string): { value: number; parts: NumericParts } | null {
  const match = /^([^\d]*?)([\d][\d,]*(?:\.\d+)?)(.*)$/u.exec(text.trim());
  if (!match) return null;
  const [, prefix = "", raw = "", suffix = ""] = match;
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const decimals = raw.includes(".") ? raw.split(".")[1]!.length : 0;
  return { value, parts: { prefix, suffix, decimals, group: raw.includes(",") } };
}

export function formatNumeric(value: number, parts: NumericParts): string {
  let body = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: parts.decimals,
    maximumFractionDigits: parts.decimals,
  }).format(value);
  if (!parts.group) body = body.replace(/[,\s\u202f\u00a0]/gu, "");
  return `${parts.prefix}${body}${parts.suffix}`;
}

const COUNT_UP_DURATION_MS = 720;

function useAnimatedMetricValue(value: string): string {
  const [display, setDisplay] = useState(value);
  const targetRef = useRef(parseNumeric(value));

  useEffect(() => {
    const target = parseNumeric(value);
    if (!target || import.meta.env.MODE === "test" || prefersReducedMotion()) {
      targetRef.current = target;
      setDisplay(value);
      return;
    }
    const previous = targetRef.current?.value ?? target.value;
    targetRef.current = target;
    if (previous === target.value) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(formatNumeric(previous + (target.value - previous) * eased, target.parts));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return display;
}

export function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  const display = useAnimatedMetricValue(value);
  return <article className={`metric metric--${tone}`}><span>{label}</span><strong>{display}</strong><small>{note}</small></article>;
}
