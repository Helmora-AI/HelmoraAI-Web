import { describe, expect, it } from "vitest";
import { KNOWN_WEBHOOK_EVENTS, buildWebhookEventList } from "./webhookEvents";

describe("webhookEvents", () => {
  it("lists the cost alert events", () => {
    const values = KNOWN_WEBHOOK_EVENTS.map((option) => option.value);
    expect(values).toContain("api_key.cost_threshold");
    expect(values).toContain("api_key.cost_limit_exceeded");
    expect(values).toContain("*");
  });

  it("collapses to all events when * is selected", () => {
    expect(buildWebhookEventList(["*"], "")).toEqual(["*"]);
    expect(buildWebhookEventList(["*", "api_key.cost_threshold"], "")).toEqual(["*"]);
    expect(buildWebhookEventList(["*"], "custom.event")).toEqual(["*"]);
  });

  it("dedupes and trims custom tokens", () => {
    expect(buildWebhookEventList(["api_key.cost_threshold"], "api_key.cost_threshold, custom.event ,")).toEqual(["api_key.cost_threshold", "custom.event"]);
    expect(buildWebhookEventList(["api_key.cost_threshold"], "")).toEqual(["api_key.cost_threshold"]);
    expect(buildWebhookEventList([], "  ")).toEqual([]);
  });
});
