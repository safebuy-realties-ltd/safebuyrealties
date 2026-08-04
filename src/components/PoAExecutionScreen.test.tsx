import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { PoAExecutionScreen } from "@/components/PoAExecutionScreen";

/**
 * E4-S2 criterion 2, on the screen the gate bites hardest on.
 *
 * Executing a Power of Attorney is signing away the authority to act on your behalf in a property
 * purchase, so the server refuses it from a buyer it cannot name. A refusal the buyer can do nothing
 * with is the failure mode worth testing: the sentence the server sent has to be the sentence they
 * read, the way to fix it has to be one click, and that click has to bring them back to the deed
 * they were part way through signing.
 */

const { executeState } = vi.hoisted(() => ({
  executeState: {
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null as unknown,
  },
}));

vi.mock("@/hooks/use-poa", () => ({
  useExecutePoaMutation: () => executeState,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    className,
  }: {
    to: string;
    search?: Record<string, unknown>;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={to} data-search={JSON.stringify(search ?? {})} className={className}>
      {children}
    </a>
  ),
}));

const REFUSAL =
  "Your identity verification needs to be approved before you can execute a Power of Attorney.";

function kycRefusal() {
  return new ApiError(REFUSAL, "KYC_REQUIRED", {
    action: "POA_EXECUTION",
    kycStatus: "SUBMITTED",
  });
}

beforeEach(() => {
  executeState.isPending = false;
  executeState.isError = false;
  executeState.error = null;
  executeState.mutateAsync.mockReset();
});

describe("PoAExecutionScreen when the KYC gate refuses", () => {
  it("shows the sentence the server sent rather than a generic failure", () => {
    executeState.isError = true;
    executeState.error = kycRefusal();

    render(<PoAExecutionScreen transactionId="tx-1" returnTo="/purchase/listing-1" />);

    expect(screen.getByTestId("poa-kyc-blocked")).toHaveTextContent(REFUSAL);
    expect(screen.queryByText(/Failed to execute Power of Attorney/i)).not.toBeInTheDocument();
  });

  it("routes the buyer to the KYC screen and carries the way back", () => {
    executeState.isError = true;
    executeState.error = kycRefusal();

    render(<PoAExecutionScreen transactionId="tx-1" returnTo="/purchase/listing-1" />);

    const link = screen.getByRole("link", { name: /verify your identity/i });
    expect(link).toHaveAttribute("href", "/dashboard/buyer/kyc");
    expect(JSON.parse(link.getAttribute("data-search") ?? "{}")).toEqual({
      redirect: "/purchase/listing-1",
    });
  });

  it("still offers the screen when the caller gave it nowhere to send them back to", () => {
    executeState.isError = true;
    executeState.error = kycRefusal();

    render(<PoAExecutionScreen transactionId="tx-1" />);

    const link = screen.getByRole("link", { name: /verify your identity/i });
    expect(link).toHaveAttribute("href", "/dashboard/buyer/kyc");
    expect(JSON.parse(link.getAttribute("data-search") ?? "{}")).toEqual({});
  });

  it("drops a return path that would leave the site", () => {
    executeState.isError = true;
    executeState.error = kycRefusal();

    render(<PoAExecutionScreen transactionId="tx-1" returnTo="https://evil.test/collect" />);

    expect(
      JSON.parse(
        screen.getByRole("link", { name: /verify your identity/i }).getAttribute("data-search") ??
          "{}",
      ),
    ).toEqual({});
  });

  it("leaves every other failure to the generic message, with no verification link", () => {
    executeState.isError = true;
    executeState.error = new ApiError(
      "A Power of Attorney has already been executed for this transaction",
      "CONFLICT",
    );

    render(<PoAExecutionScreen transactionId="tx-1" returnTo="/purchase/listing-1" />);

    expect(screen.queryByTestId("poa-kyc-blocked")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /verify your identity/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/already been executed/i);
  });

  it("says nothing about KYC until something is refused", () => {
    render(<PoAExecutionScreen transactionId="tx-1" returnTo="/purchase/listing-1" />);

    expect(screen.queryByTestId("poa-kyc-blocked")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /execute power of attorney/i })).toBeDisabled();
  });
});
