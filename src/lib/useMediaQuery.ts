import { useCallback, useSyncExternalStore } from "react";

function matches(query: string): boolean {
  return typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false;
}

/** Reactive matchMedia hook. Returns false when matchMedia is unavailable (e.g. jsdom). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => { mql.removeEventListener("change", onChange); };
  }, [query]);

  return useSyncExternalStore(subscribe, () => matches(query), () => false);
}
