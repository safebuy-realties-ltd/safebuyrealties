import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { PoaVerifyResult, type PoaVerifyResultProps } from "./PoaVerifyResult";
import type { PoaVerifyDto } from "@/hooks/use-poa";

const hash64 = "a".repeat(64);

const match: PoaVerifyDto = {
  verified: true,
  documentHash: hash64,
  listingTitle: "4-Bed Duplex",
  listingAddress: "Lekki Phase 1, Lagos",
  executedAt: "2026-05-26T12:00:00.000Z",
};

/** PoaVerifyResult renders <Link>, which needs a router in context. */
function renderInRouter(props: PoaVerifyResultProps) {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <PoaVerifyResult {...props} />,
  });
  const dueDiligenceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/due-diligence",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, dueDiligenceRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router as never} />);
}

describe("PoaVerifyResult", () => {
  it("shows the property, execution date and document hash on a match", async () => {
    renderInRouter({ hash: hash64, isLoading: false, isError: false, data: match });

    expect(await screen.findByText("Power of Attorney verified")).toBeInTheDocument();
    expect(screen.getByText("4-Bed Duplex")).toBeInTheDocument();
    expect(screen.getByText("Lekki Phase 1, Lagos")).toBeInTheDocument();
    expect(screen.getByText("26 May 2026")).toBeInTheDocument();
    expect(screen.getByText(hash64)).toBeInTheDocument();
  });

  it("discloses no party, contact or price on a match", async () => {
    const { container } = renderInRouter({
      hash: hash64,
      isLoading: false,
      isError: false,
      data: match,
    });

    await screen.findByText("Power of Attorney verified");
    const rendered = container.textContent ?? "";

    // The DTO carries none of these, and the page invents none of them either.
    for (const label of ["Buyer", "Signed by", "Email", "Phone", "Price", "₦"]) {
      expect(rendered).not.toContain(label);
    }
  });

  it("shows a not-found state and a support route on a miss", async () => {
    renderInRouter({ hash: hash64, isLoading: false, isError: true, data: undefined });

    expect(await screen.findByText("No matching document")).toBeInTheDocument();
    expect(screen.getByText(hash64)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contact SafeBuyRealties" })).toHaveAttribute(
      "href",
      "/due-diligence",
    );
  });

  it("prompts for a hash when the link carries none", async () => {
    renderInRouter({ hash: undefined, isLoading: false, isError: false, data: undefined });

    expect(await screen.findByText("No document hash supplied")).toBeInTheDocument();
  });

  it("shows a checking state while the register is queried", async () => {
    renderInRouter({ hash: hash64, isLoading: true, isError: false, data: undefined });

    expect(await screen.findByText("Checking the register…")).toBeInTheDocument();
  });
});

describe("the /verify route", () => {
  it("is registered in the generated route tree", () => {
    const routeTree = readFileSync(resolve(process.cwd(), "src/routeTree.gen.ts"), "utf8");

    expect(routeTree).toContain("from './routes/verify'");
    expect(routeTree).toContain("path: '/verify'");
  });
});
