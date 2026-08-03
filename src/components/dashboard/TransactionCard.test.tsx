import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TransactionCard } from "@/components/dashboard/TransactionCard";
import type { TransactionDto } from "@/hooks/use-transactions";

/**
 * E1-S4. What the buyer is shown about a purchase, and what the browser sends when they take it.
 *
 * The point of these is the seam the story moved. The purchase button is drawn from the server's
 * answer on `tx.purchase`, not from the status on the row, and the payment behind a transaction
 * arrives on `tx.latestPayment` rather than out of localStorage. Both of those are easy to
 * accidentally reintroduce, and neither shows up in a type error when it is.
 */

const { apiRequest, openPaystackCheckout, toastCalls } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  openPaystackCheckout: vi.fn(),
  toastCalls: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiRequest };
});

vi.mock("@/lib/paystack", () => ({ openPaystackCheckout }));

vi.mock("sonner", () => ({ toast: toastCalls }));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    useAuth: () => ({ user: { id: "buyer-1", role: "buyer" }, isReady: true }),
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/listing">{children}</a>,
}));

function transaction(overrides: Partial<TransactionDto> = {}): TransactionDto {
  return {
    id: "tx-1",
    status: "DD_COMPLETE",
    buyerId: "buyer-1",
    listingId: "listing-1",
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-02T10:00:00.000Z",
    listing: {
      id: "listing-1",
      title: "Three bedroom in Lekki",
      location: "Lekki, Lagos",
      price: "85000000",
      currency: "NGN",
      status: "LIVE",
    },
    purchase: { canPurchase: true, blockedBy: null, reason: null, caution: null },
    latestPayment: null,
    ...overrides,
  };
}

function renderCard(tx: TransactionDto) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TransactionCard tx={tx} />
    </QueryClientProvider>,
  );
}

/** The escrow row the card fetches when a purchase is behind the transaction. */
function escrowEnvelope(unmetConditions: { code: string; label: string }[]) {
  return {
    data: {
      id: "esc-1",
      transactionId: "tx-1",
      status: "HELD",
      heldAmount: "85000000",
      releaseConditions: null,
      conditionsMet: null,
      heldAt: "2026-07-02T10:00:00.000Z",
      releasedAt: null,
      refundedAt: null,
      releasedById: null,
      releaseNote: null,
      unmetConditions,
      transaction: {
        id: "tx-1",
        status: "PURCHASE_IN_ESCROW",
        buyerId: "buyer-1",
        listingId: "listing-1",
        listing: { id: "listing-1", title: "t", sellerId: "seller-1", status: "LIVE" },
        buyer: { id: "buyer-1", name: "B", email: "b@example.test" },
      },
      createdAt: "2026-07-02T10:00:00.000Z",
      updatedAt: "2026-07-02T10:00:00.000Z",
    },
  };
}

beforeEach(() => {
  apiRequest.mockReset();
  openPaystackCheckout.mockReset();
  toastCalls.success.mockReset();
  toastCalls.error.mockReset();
  toastCalls.message.mockReset();
  apiRequest.mockRejectedValue(new Error("no stub for this request"));
});

describe("criterion 1: the purchase action follows the server, not the row", () => {
  it("offers the purchase when the server says the buyer may take it", () => {
    renderCard(transaction());

    expect(screen.getByRole("button", { name: /^Purchase/ })).toBeInTheDocument();
  });

  it("withholds it when the server says no, whatever the status reads", () => {
    // DD_COMPLETE on the row and canPurchase false from the server. The server wins, because it is
    // the one that will refuse the POST.
    renderCard(
      transaction({
        purchase: {
          canPurchase: false,
          blockedBy: "KYC_REQUIRED",
          reason: "Complete your identity verification before purchasing.",
          caution: null,
        },
      }),
    );

    expect(screen.queryByRole("button", { name: /^Purchase/ })).not.toBeInTheDocument();
  });

  it("offers due diligence rather than purchase while due diligence is still unpaid", () => {
    renderCard(
      transaction({
        status: "INITIATED",
        purchase: {
          canPurchase: false,
          blockedBy: "DUE_DILIGENCE_UNFINISHED",
          reason: "Due diligence has to finish before the property can be purchased.",
          caution: null,
        },
      }),
    );

    expect(screen.getByRole("button", { name: /^Pay / })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Purchase/ })).not.toBeInTheDocument();
  });
});

describe("criterion 6: a verdict of concern is explained, not silently obeyed", () => {
  it("shows the reason the due diligence verdict blocked the purchase", () => {
    renderCard(
      transaction({
        purchase: {
          canPurchase: false,
          blockedBy: "VERDICT_AGAINST",
          reason: "Due diligence returned do not proceed on this property.",
          caution: null,
        },
      }),
    );

    expect(screen.getByTestId("purchase-blocked")).toHaveTextContent(/do not proceed/i);
  });

  it("shows a caution without taking the decision away from the buyer", () => {
    renderCard(
      transaction({
        purchase: {
          canPurchase: true,
          blockedBy: null,
          reason: null,
          caution: "Due diligence returned proceed with caution. Read the report first.",
        },
      }),
    );

    expect(screen.getByTestId("purchase-caution")).toHaveTextContent(/proceed with caution/i);
    expect(screen.getByRole("button", { name: /^Purchase/ })).toBeInTheDocument();
  });

  it("stays quiet about a feature that is switched off", () => {
    // A dark flag is not the buyer's business, and naming it would advertise unreleased work.
    renderCard(
      transaction({
        purchase: {
          canPurchase: false,
          blockedBy: "FEATURE_OFF",
          reason: "Buying a property on the platform is not open yet.",
          caution: null,
        },
      }),
    );

    expect(screen.queryByTestId("purchase-blocked")).not.toBeInTheDocument();
  });

  it("does not repeat what the status badge already says", () => {
    renderCard(
      transaction({
        status: "PURCHASE_IN_ESCROW",
        purchase: {
          canPurchase: false,
          blockedBy: "ALREADY_IN_ESCROW",
          reason: "The purchase amount is already held in escrow.",
          caution: null,
        },
      }),
    );

    expect(screen.queryByTestId("purchase-blocked")).not.toBeInTheDocument();
    expect(screen.getByText("Purchase In Escrow")).toBeInTheDocument();
  });
});

describe("criterion 2 and 3: starting the purchase", () => {
  it("names no amount, so the sum held is the server's price and not the browser's", async () => {
    apiRequest.mockResolvedValue({
      data: {
        paymentId: "pay-1",
        authorizationUrl: "https://checkout.paystack.com/x",
        reference: "ref_1",
        accessCode: "code_1",
      },
    });

    renderCard(transaction());
    fireEvent.click(screen.getByRole("button", { name: /^Purchase/ }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe("/payments/purchase");
    expect(JSON.parse(init.body)).toEqual({
      transactionId: "tx-1",
      callbackUrl: expect.stringContaining("/dashboard/buyer/transactions?mock=1"),
    });
    expect(JSON.parse(init.body)).not.toHaveProperty("amount");
  });

  it("opens the Paystack window when the server returns an access code", async () => {
    apiRequest.mockResolvedValue({
      data: {
        paymentId: "pay-1",
        authorizationUrl: "https://checkout.paystack.com/x",
        reference: "ref_1",
        accessCode: "code_1",
      },
    });

    renderCard(transaction());
    fireEvent.click(screen.getByRole("button", { name: /^Purchase/ }));

    await waitFor(() => expect(openPaystackCheckout).toHaveBeenCalled());
    expect(openPaystackCheckout.mock.calls[0][0].accessCode).toBe("code_1");
  });

  it("reports the server's refusal rather than a generic failure", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    apiRequest.mockRejectedValue(
      new ApiError("Due diligence returned do not proceed.", "PURCHASE_BLOCKED"),
    );

    renderCard(transaction());
    fireEvent.click(screen.getByRole("button", { name: /^Purchase/ }));

    await waitFor(() =>
      expect(toastCalls.error).toHaveBeenCalledWith("Due diligence returned do not proceed."),
    );
  });
});

describe("criterion 4: an abandoned checkout is told to the server", () => {
  it("calls abandon when the buyer closes the purchase window", async () => {
    apiRequest.mockResolvedValue({
      data: {
        paymentId: "pay-1",
        authorizationUrl: "https://checkout.paystack.com/x",
        reference: "ref_1",
        accessCode: "code_1",
      },
    });

    renderCard(transaction());
    fireEvent.click(screen.getByRole("button", { name: /^Purchase/ }));
    await waitFor(() => expect(openPaystackCheckout).toHaveBeenCalled());

    openPaystackCheckout.mock.calls[0][0].onCancel();

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/payments/pay-1/abandon", { method: "POST" }),
    );
  });

  it("does not abandon anything when a due diligence window is closed", async () => {
    // The due diligence path has no PURCHASE_PENDING to unwind, so there is nothing to tell the
    // server and calling abandon would move a transaction that never left DD_PURCHASED.
    apiRequest.mockResolvedValue({
      data: {
        paymentId: "pay-1",
        authorizationUrl: "https://checkout.paystack.com/x",
        reference: "ref_1",
        accessCode: "code_1",
      },
    });

    renderCard(
      transaction({
        status: "DD_PURCHASED",
        purchase: {
          canPurchase: false,
          blockedBy: "DUE_DILIGENCE_UNFINISHED",
          reason: "Due diligence has to finish first.",
          caution: null,
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Pay / }));
    await waitFor(() => expect(openPaystackCheckout).toHaveBeenCalled());

    openPaystackCheckout.mock.calls[0][0].onCancel();

    await waitFor(() => expect(toastCalls.message).toHaveBeenCalledWith("Payment window closed."));
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.stringContaining("/abandon"),
      expect.anything(),
    );
  });

  it("settles in place when mock mode has already applied the payment", async () => {
    apiRequest.mockResolvedValue({
      data: {
        paymentId: "pay-1",
        authorizationUrl: "http://localhost:8080/dashboard/buyer/transactions?mock=1",
        reference: "mock_pay-1",
        accessCode: null,
      },
    });

    renderCard(transaction());
    fireEvent.click(screen.getByRole("button", { name: /^Purchase/ }));

    await waitFor(() => expect(toastCalls.success).toHaveBeenCalled());
    expect(openPaystackCheckout).not.toHaveBeenCalled();
  });

  it("verifies server side when Paystack reports success", async () => {
    apiRequest.mockResolvedValue({
      data: {
        paymentId: "pay-1",
        authorizationUrl: "https://checkout.paystack.com/x",
        reference: "ref_1",
        accessCode: "code_1",
      },
    });

    renderCard(transaction());
    fireEvent.click(screen.getByRole("button", { name: /^Purchase/ }));
    await waitFor(() => expect(openPaystackCheckout).toHaveBeenCalled());

    openPaystackCheckout.mock.calls[0][0].onSuccess();

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/payments/pay-1/verify", { method: "POST" }),
    );
  });
});

describe("criterion 5: what the buyer is told about the money being held", () => {
  it("shows the escrow state, the held amount and what is still outstanding", async () => {
    apiRequest.mockImplementation((path: string) =>
      path === "/escrow/tx-1"
        ? Promise.resolve(
            escrowEnvelope([
              { code: "TITLE_TRANSFER", label: "Title transfer recorded at the land registry" },
              { code: "HANDOVER", label: "Keys handed over and confirmed by the buyer" },
            ]),
          )
        : Promise.reject(new Error("unexpected request")),
    );

    renderCard(
      transaction({
        status: "PURCHASE_IN_ESCROW",
        purchase: {
          canPurchase: false,
          blockedBy: "ALREADY_IN_ESCROW",
          reason: "Already held.",
          caution: null,
        },
      }),
    );

    const panel = await screen.findByTestId("escrow-panel");
    expect(panel).toHaveTextContent("Held");
    expect(panel).toHaveTextContent("85,000,000");
    expect(panel).toHaveTextContent("Title transfer recorded at the land registry");
    expect(panel).toHaveTextContent("Keys handed over and confirmed by the buyer");
  });

  it("says so plainly when nothing is outstanding", async () => {
    apiRequest.mockImplementation((path: string) =>
      path === "/escrow/tx-1"
        ? Promise.resolve(escrowEnvelope([]))
        : Promise.reject(new Error("unexpected request")),
    );

    renderCard(
      transaction({
        status: "PURCHASE_IN_ESCROW",
        purchase: {
          canPurchase: false,
          blockedBy: "ALREADY_IN_ESCROW",
          reason: "Already held.",
          caution: null,
        },
      }),
    );

    expect(await screen.findByText(/Every release condition has been met/)).toBeInTheDocument();
  });

  it("does not go looking for escrow before there is a purchase behind the transaction", () => {
    renderCard(transaction());

    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.queryByTestId("escrow-panel")).not.toBeInTheDocument();
  });
});

describe("the payment behind a transaction travels with the transaction", () => {
  it("reads the reference off the row rather than out of the browser's storage", () => {
    renderCard(
      transaction({
        latestPayment: {
          id: "pay-1",
          status: "SUCCEEDED",
          intent: "PROPERTY_PURCHASE",
          amount: "85000000",
          reference: "sbr_ref_9",
          createdAt: "2026-07-02T10:00:00.000Z",
        },
      }),
    );

    expect(screen.getByText("sbr_ref_9")).toBeInTheDocument();
    expect(screen.getByText("Property Purchase Payment")).toBeInTheDocument();
    expect(window.localStorage).toHaveLength(0);
  });

  it("draws the timeline from the payment when there is one", () => {
    renderCard(
      transaction({
        status: "PURCHASE_PENDING",
        latestPayment: {
          id: "pay-1",
          status: "FAILED",
          intent: "PROPERTY_PURCHASE",
          amount: "85000000",
          reference: null,
          createdAt: "2026-07-02T10:00:00.000Z",
        },
      }),
    );

    expect(screen.getByText("Payment failed")).toBeInTheDocument();
  });

  it("falls back to the transaction's own timeline before any payment exists", () => {
    renderCard(
      transaction({
        status: "IN_PROGRESS",
        purchase: {
          canPurchase: false,
          blockedBy: "DUE_DILIGENCE_UNFINISHED",
          reason: "Due diligence has to finish first.",
          caution: null,
        },
      }),
    );

    expect(screen.queryByText("Escrow initiated")).not.toBeInTheDocument();
    expect(screen.getByText("Initiated")).toBeInTheDocument();
    expect(screen.getByText("Due Diligence Payment")).toBeInTheDocument();
  });
});
