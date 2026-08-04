import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DdReportDownloads } from "@/components/dashboard/DdReportDownloads";
import { ApiError } from "@/lib/api";
import type { DdReportsDto } from "@/hooks/use-dd-reports";

/**
 * E1-S3 criterion 5. What the buyer is shown about the document they paid for.
 *
 * The cases below are mostly about restraint. The screen already knows whether a report exists, so
 * it says so without asking the server; asking would mint a credential and write an audit row for
 * a buyer who has not asked to download anything. And the case that gets its own words is the
 * awkward one: work finished, nothing attached. That is not an error state and it is not "not
 * ready", and collapsing it into either leaves a paying buyer staring at an empty cell.
 */

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiRequest };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function reportsResponse(overrides: Partial<DdReportsDto> = {}): { data: DdReportsDto } {
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  return {
    data: {
      orderId: "order-1",
      status: "COMPLETE",
      expiresAt,
      reports: [
        {
          key: "due-diligence/order-1/reports/1753776000000-title-search.pdf",
          fileName: "title-search.pdf",
          url: "/api/v1/documents/file?key=due-diligence%2Forder-1%2Freports%2Ftitle-search.pdf&grant=abc",
          expiresAt,
        },
      ],
      ...overrides,
    },
  };
}

function renderPanel(props: Partial<Parameters<typeof DdReportDownloads>[0]> = {}) {
  return render(
    <DdReportDownloads orderId="order-1" status="COMPLETE" reportCount={1} {...props} />,
    { wrapper },
  );
}

beforeEach(() => {
  apiRequest.mockReset();
});

describe("availability, before anyone asks for bytes", () => {
  it("says a complete case has no report attached, in those words", () => {
    renderPanel({ status: "COMPLETE", reportCount: 0 });

    expect(screen.getByText(/report not attached yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says something different when the case is simply not finished", () => {
    renderPanel({ status: "IN_PROGRESS", reportCount: 0 });

    expect(screen.getByText(/reports appear here once the case is complete/i)).toBeInTheDocument();
    expect(screen.queryByText(/not attached yet/i)).not.toBeInTheDocument();
  });

  it("counts the reports without calling the endpoint that signs links", () => {
    renderPanel({ reportCount: 2 });

    expect(screen.getByText("2 reports ready")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("counts one report in the singular, because a table of ones reads badly otherwise", () => {
    renderPanel({ reportCount: 1 });

    expect(screen.getByText("1 report ready")).toBeInTheDocument();
  });
});

describe("download state, once the buyer asks", () => {
  it("fetches links on the click and names the file rather than the position", async () => {
    apiRequest.mockResolvedValue(reportsResponse());

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /get download links/i }));

    const link = await screen.findByRole("link", { name: /title-search\.pdf/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/api/v1/documents/file?key="));
    expect(link.getAttribute("href")).toContain("grant=");
    expect(apiRequest).toHaveBeenCalledWith("/due-diligence-orders/order-1/reports");
  });

  it("shows how long the link is good for", async () => {
    apiRequest.mockResolvedValue(reportsResponse());

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /get download links/i }));

    expect(await screen.findByText(/15 minutes left/i)).toBeInTheDocument();
  });

  it("replaces expired links with an offer of fresh ones rather than leaving a dead href", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    apiRequest.mockResolvedValue(
      reportsResponse({
        expiresAt: past,
        reports: [
          {
            key: "due-diligence/order-1/reports/1753776000000-title-search.pdf",
            fileName: "title-search.pdf",
            url: "/api/v1/documents/file?key=x&grant=stale",
            expiresAt: past,
          },
        ],
      }),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /get download links/i }));

    expect(await screen.findByText(/those links have expired/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /title-search\.pdf/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get fresh links/i })).toBeInTheDocument();
  });

  it("signs a new set when the buyer asks again, instead of serving the old answer", async () => {
    apiRequest.mockResolvedValue(reportsResponse());

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /get download links/i }));
    await screen.findByRole("link", { name: /title-search\.pdf/i });

    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("says nothing about why a stranger sees nothing, only that it is not theirs", async () => {
    apiRequest.mockRejectedValue(new ApiError("Due diligence order not found", "NOT_FOUND"));

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /get download links/i }));

    expect(await screen.findByText(/not available to this account/i)).toBeInTheDocument();
  });

  it("offers a retry when the request simply failed", async () => {
    apiRequest.mockRejectedValue(new ApiError("Network error", "NETWORK_ERROR"));

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /get download links/i }));

    expect(await screen.findByText(/could not prepare the download links/i)).toBeInTheDocument();

    apiRequest.mockResolvedValue(reportsResponse());
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("link", { name: /title-search\.pdf/i })).toBeInTheDocument();
  });

  it("handles a row that promised a report the server no longer has", async () => {
    apiRequest.mockResolvedValue(reportsResponse({ reports: [] }));

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /get download links/i }));

    await waitFor(() =>
      expect(screen.getByText(/no longer attached to this case/i)).toBeInTheDocument(),
    );
  });
});
