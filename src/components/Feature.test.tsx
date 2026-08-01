import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Feature } from "@/components/Feature";

const apiRequest = vi.fn();

vi.mock("@/lib/api", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  ApiError: class ApiError extends Error {},
  API_BASE_URL: "http://test",
}));

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("Feature", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("renders its children once the server says the flag is on", async () => {
    apiRequest.mockResolvedValue({ data: { flags: { payouts: true } } });

    renderWithQuery(
      <Feature flag="payouts">
        <button>Request payout</button>
      </Feature>,
    );

    expect(await screen.findByRole("button", { name: "Request payout" })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/feature-flags");
  });

  it("renders nothing while the flag is off, leaving no hole where the control was", async () => {
    apiRequest.mockResolvedValue({ data: { flags: { payouts: false } } });

    const { container } = renderWithQuery(
      <Feature flag="payouts">
        <button>Request payout</button>
      </Feature>,
    );

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the fallback instead when one is given", async () => {
    apiRequest.mockResolvedValue({ data: { flags: { payouts: false } } });

    renderWithQuery(
      <Feature flag="payouts" fallback={<p>Payouts open next month.</p>}>
        <button>Request payout</button>
      </Feature>,
    );

    expect(await screen.findByText("Payouts open next month.")).toBeInTheDocument();
  });

  it("hides the children before the response arrives, so nothing is offered too early", () => {
    apiRequest.mockReturnValue(new Promise(() => undefined));

    renderWithQuery(
      <Feature flag="payouts">
        <button>Request payout</button>
      </Feature>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("treats a key the server did not send as off", async () => {
    apiRequest.mockResolvedValue({ data: { flags: { kyc_gate: true } } });

    renderWithQuery(
      <Feature flag="payuots">
        <button>Request payout</button>
      </Feature>,
    );

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to off when the request fails, rather than to whatever it had", async () => {
    apiRequest.mockRejectedValue(new Error("network"));

    renderWithQuery(
      <Feature flag="payouts">
        <button>Request payout</button>
      </Feature>,
    );

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("inverts with `not`, for the message that replaces a switched-off feature", async () => {
    apiRequest.mockResolvedValue({ data: { flags: { payouts: false } } });

    renderWithQuery(
      <Feature flag="payouts" not>
        <p>Payouts are paused.</p>
      </Feature>,
    );

    expect(await screen.findByText("Payouts are paused.")).toBeInTheDocument();
  });
});
