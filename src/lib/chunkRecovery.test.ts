import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildChunkRecoveryKey,
  consumeChunkReload,
  isChunkLoadError,
  readBuildId,
  resolveChunkRecovery,
} from "./chunkRecovery";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("chunkRecovery", () => {
  it("detects stale dynamic-import and Vite preload failures", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://example/assets/ChatPage-x.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Failed to load module script: Expected a JavaScript-or-Wasm module script"))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
  });

  it("does not treat unrelated render errors as stale chunks", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("permits exactly one guarded reload per build and path", () => {
    const storage = sessionStorage;
    const key = buildChunkRecoveryKey("/chat", "/assets/index-abc.js");
    expect(consumeChunkReload(key, storage)).toBe(true);
    expect(consumeChunkReload(key, storage)).toBe(false);
    expect(consumeChunkReload(buildChunkRecoveryKey("/usage", "/assets/index-abc.js"), storage)).toBe(true);
    expect(consumeChunkReload(buildChunkRecoveryKey("/chat", "/assets/index-def.js"), storage)).toBe(true);
  });

  it("resolves reload then recover for repeated chunk failures", () => {
    const storage = sessionStorage;
    const options = { pathname: "/chat", buildId: "/assets/index-abc.js", storage };
    expect(resolveChunkRecovery(new TypeError("Failed to fetch dynamically imported module"), options)).toBe("reload");
    expect(resolveChunkRecovery(new TypeError("Failed to fetch dynamically imported module"), options)).toBe("recover");
  });

  it("ignores non-chunk errors so normal boundaries stay in charge", () => {
    expect(resolveChunkRecovery(new Error("render boom"), { pathname: "/chat", buildId: "b1" })).toBe("ignore");
  });

  it("reads the entry module src as the build id", () => {
    const doc = document.implementation.createHTMLDocument();
    const script = doc.createElement("script");
    script.type = "module";
    script.src = "/assets/index-DYroIpuc.js";
    doc.head.append(script);
    expect(readBuildId(doc)).toBe("/assets/index-DYroIpuc.js");
  });
});
