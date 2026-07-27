/** Detect Vite/dynamic-import chunk failures vs ordinary render errors. */
export function isChunkLoadError(error: unknown): boolean {
  if (error == null) return false;
  if (isVitePreloadPayload(error)) return true;
  const message = errorMessage(error);
  if (!message) return false;
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk [\w.-]+ failed|Failed to load module script/i.test(message);
}

export function buildChunkRecoveryKey(pathname: string, buildId: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `helmora.chunk-reload:${buildId}:${path}`;
}

/** Returns true once per key; subsequent calls return false (reload already spent). */
export function consumeChunkReload(key: string, storage: Storage = sessionStorage): boolean {
  try {
    if (storage.getItem(key) === "1") return false;
    storage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

export function readBuildId(doc: Document = document): string {
  const entry = doc.querySelector('script[type="module"][src]')?.getAttribute("src")?.trim();
  return entry && entry.length > 0 ? entry : "unknown-build";
}

export function resolveChunkRecovery(
  error: unknown,
  options: { pathname: string; buildId: string; storage?: Storage },
): "reload" | "recover" | "ignore" {
  if (!isChunkLoadError(error)) return "ignore";
  const key = buildChunkRecoveryKey(options.pathname, options.buildId);
  return consumeChunkReload(key, options.storage ?? sessionStorage) ? "reload" : "recover";
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

function isVitePreloadPayload(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const payload = error as { type?: string; payload?: unknown };
  return payload.type === "vite:preloadError" || payload.payload instanceof Event;
}
