import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "../lib/api/client";
import { RequestError } from "./InlineAlert";

describe("RequestError", () => {
  it("renders code and request id for ordinary API errors", () => {
    const error = new ApiError({ status: 400, code: "JSON_INVALID", message: "Bad payload.", requestId: "req_1" });
    const view = render(<RequestError error={error} />);
    expect(view.getByText("Bad payload.")).toBeTruthy();
    expect(view.getByText(/JSON_INVALID/).textContent).toContain("req_1");
    expect(view.container.textContent).not.toMatch(/limit|spent/iu);
    view.unmount();
  });

  it("adds a spent-vs-limit line for COST_LIMIT_EXCEEDED with details", () => {
    const error = new ApiError({ status: 429, code: "COST_LIMIT_EXCEEDED", message: "The API key daily cost limit was exceeded.", retryable: false, details: { period: "day", limitUsd: 2, spentUsd: 2.5 } });
    const view = render(<RequestError error={error} />);
    expect(view.container.textContent).toContain("daily limit $2.00 · spent $2.50");
    view.unmount();
  });

  it("falls back to the meta only when details are missing", () => {
    const error = new ApiError({ status: 429, code: "COST_LIMIT_EXCEEDED", message: "The API key monthly cost limit was exceeded.", retryable: false });
    const view = render(<RequestError error={error} />);
    expect(view.getByText(/COST_LIMIT_EXCEEDED/)).toBeTruthy();
    expect(view.container.textContent).not.toMatch(/limit \$|spent/iu);
    view.unmount();
  });
});
