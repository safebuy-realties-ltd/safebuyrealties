import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KycReturnNotice } from "@/components/dashboard/KycReturnNotice";

/**
 * E4-S2 criterion 2, the end of the round trip.
 *
 * A buyer who is stopped by the KYC gate is part way through something else, and sending them to
 * this screen with no way back means the something else is over. The return path arrives as a search
 * param, which means it arrives from the URL bar as readily as from our own link, so the guard on it
 * is the point of the component as much as the button is.
 */

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

beforeEach(() => {
  navigate.mockReset();
});

describe("KycReturnNotice", () => {
  it("says nothing when the buyer came here of their own accord", () => {
    render(<KycReturnNotice status="NOT_SUBMITTED" />);

    expect(screen.queryByTestId("kyc-return")).not.toBeInTheDocument();
  });

  it.each([
    ["an absolute URL", "https://evil.test/collect"],
    ["a protocol-relative URL", "//evil.test/collect"],
    ["a bare host", "evil.test"],
  ])("refuses to offer %s as a way back", (_label, hostile) => {
    render(<KycReturnNotice status="VERIFIED" redirect={hostile} />);

    expect(screen.queryByTestId("kyc-return")).not.toBeInTheDocument();
  });

  it("offers the way back while the documents are still under review", () => {
    render(<KycReturnNotice status="SUBMITTED" redirect="/purchase/listing-1" />);

    expect(screen.getByTestId("kyc-return")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to where you left off/i })).toBeEnabled();
  });

  it("tells a verified buyer they can carry on", () => {
    render(<KycReturnNotice status="VERIFIED" redirect="/purchase/listing-1" />);

    expect(screen.getByTestId("kyc-return")).toHaveTextContent(/your identity is verified/i);
  });

  it("takes a buyer back into the purchase they were part way through", () => {
    render(<KycReturnNotice status="VERIFIED" redirect="/purchase/listing-1" />);

    fireEvent.click(screen.getByRole("button", { name: /back to where you left off/i }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/purchase/$listingId",
      params: { listingId: "listing-1" },
    });
  });

  it("takes the query string back with it", () => {
    render(
      <KycReturnNotice status="VERIFIED" redirect="/dashboard/buyer/transactions?mock=1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /back to where you left off/i }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/buyer/transactions",
      search: { mock: "1" },
    });
  });
});
