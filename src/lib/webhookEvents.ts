export interface WebhookEventOption {
  value: string;
  label: string;
  description?: string;
}

export const KNOWN_WEBHOOK_EVENTS: WebhookEventOption[] = [
  { value: "*", label: "All events", description: "Every event the Hub emits, including future ones." },
  { value: "api_key.cost_threshold", label: "api_key.cost_threshold", description: "An API key crossed 50% or 80% of a configured cost ceiling." },
  { value: "api_key.cost_limit_exceeded", label: "api_key.cost_limit_exceeded", description: "An API key was blocked by a configured cost ceiling." },
];

export function buildWebhookEventList(selected: readonly string[], custom: string): string[] {
  const tokens = custom.split(",").map((item) => item.trim()).filter(Boolean);
  if (selected.includes("*")) return ["*"];
  return [...new Set([...selected, ...tokens])];
}
