import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MockPaymentModeBanner, PayoutSummary } from "./PaymentModeNotice";
import type { PayoutDto } from "@/hooks/use-escrow";

function payout(overrides: Partial<PayoutDto> = {}): PayoutDto {
  return {
    id: "payout-1",
    transactionId: "tx-1",
    sellerId: "seller-1",
    grossAmount: "1000000",
    platformFee: "50000",
    netAmount: "950000",
    status: "COMPLETED",
    gatewayReference: "mock_transfer_tx-1",
    isMock: true,
    initiatedAt: "2026-07-29T10:00:00.000Z",
    completedAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}

describe("MockPaymentModeBanner", () => {
  it("warns the operator that releasing escrow moves no money", () => {
    render(<MockPaymentModeBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("Payments are in mock mode");
    expect(screen.getByRole("status")).toHaveTextContent(/Sellers will not be paid/);
  });
});

describe("PayoutSummary", () => {
  it("badges a mock payout", () => {
    render(<PayoutSummary payout={payout()} />);

    expect(screen.getByText(/Mock — no money moved/)).toBeInTheDocument();
  });

  it("does not badge a live payout", () => {
    render(<PayoutSummary payout={payout({ isMock: false, gatewayReference: "sbr_payout_x" })} />);

    expect(screen.queryByText(/Mock — no money moved/)).not.toBeInTheDocument();
  });

  it("shows the amounts an operator needs to reconcile the release", () => {
    render(<PayoutSummary payout={payout()} />);

    expect(screen.getByText("₦950000")).toBeInTheDocument();
    expect(screen.getByText("₦50000")).toBeInTheDocument();
  });
});
