import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardLayout, PageHeader, StatCard } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useListingsQuery } from "@/hooks/use-listings";
import { useAssignVerificationMutation, useVerificationListingQuery } from "@/hooks/use-verification";
import { useProfessionalsQuery } from "@/hooks/use-users";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/dashboard/staff/workflow")({
  validateSearch: (search: Record<string, unknown>): { listing?: string } => ({
    listing: typeof search.listing === "string" ? search.listing : undefined,
  }),
  component: () => (
    <DashboardLayout role="staff">
      <StaffWorkflow />
    </DashboardLayout>
  ),
});

function StaffWorkflow() {
  const { listing: listingFromSearch } = Route.useSearch();
  const { data: listingsData, isLoading: listingsLoading, isError: listingsError, error: listingsErr } =
    useListingsQuery({ pageSize: 100 });
  const listings = listingsData?.listings ?? [];

  const { data: prosData, isLoading: prosLoading } = useProfessionalsQuery();
  const professionals = prosData?.users ?? [];

  const [q, setQ] = useState("");
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  useEffect(() => {
    if (!listingFromSearch) return;
    if (listings.some((l) => l.id === listingFromSearch)) {
      setSelectedListingId(listingFromSearch);
    }
  }, [listingFromSearch, listings]);

  const filteredListings = useMemo(() => {
    if (!q.trim()) return listings;
    const n = q.toLowerCase();
    return listings.filter(
      (l) =>
        l.title.toLowerCase().includes(n) ||
        l.location.toLowerCase().includes(n) ||
        l.id.toLowerCase().includes(n) ||
        l.status.toLowerCase().includes(n) ||
        (l.sellerName ?? "").toLowerCase().includes(n),
    );
  }, [listings, q]);

  const selectedListing = listings.find((l) => l.id === selectedListingId) ?? null;

  const {
    data: steps,
    isLoading: stepsLoading,
    isError: stepsError,
    error: stepsErr,
    refetch: refetchSteps,
  } = useVerificationListingQuery(selectedListingId ?? "", !!selectedListingId);

  const assignMutation = useAssignVerificationMutation();
  const [professionalByStep, setProfessionalByStep] = useState<Record<string, string>>({});

  const inWorkflow = useMemo(
    () => listings.filter((l) => ["PENDING_REVIEW", "ASSIGNED", "IN_VERIFICATION"].includes(l.status)).length,
    [listings],
  );

  const assignStep = (stepType: string) => {
    if (!selectedListingId) return;
    const professionalId = professionalByStep[stepType];
    if (!professionalId) {
      toast.error("Choose a professional first.");
      return;
    }
    assignMutation.mutate(
      { listingId: selectedListingId, professionalId, stepType },
      {
        onSuccess: () => toast.success("Verification step assigned."),
        onError: (e) => {
          const msg = e instanceof ApiError ? e.message : "Assignment failed.";
          toast.error(msg);
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Workflow"
        description="Pick a listing, load verification steps, and assign each step to a professional."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Listings loaded" value={String(listings.length)} />
        <StatCard label="In review / verification" value={String(inWorkflow)} />
        <StatCard label="Professionals" value={String(professionals.length)} />
      </div>

      {listingsError && (
        <p className="mt-4 text-sm text-destructive">
          {listingsErr instanceof Error ? listingsErr.message : "Could not load listings."}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Listings</h2>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by title, location, status…"
              className="h-9 pl-8"
            />
          </div>
          <div className="mt-3 max-h-[420px] space-y-1 overflow-y-auto text-sm">
            {listingsLoading && <p className="text-muted-foreground">Loading…</p>}
            {!listingsLoading && filteredListings.length === 0 && (
              <p className="text-muted-foreground">No listings match.</p>
            )}
            {filteredListings.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedListingId(l.id)}
                className={`flex w-full flex-col rounded border px-2 py-2 text-left ${
                  selectedListingId === l.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{l.title}</span>
                <span className="text-xs text-muted-foreground">
                  {l.status} · {l.location}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Verification steps</h2>
          {!selectedListingId && (
            <p className="mt-3 text-sm text-muted-foreground">Select a listing to load its verification pipeline.</p>
          )}
          {selectedListing && (
            <p className="mt-2 text-xs text-muted-foreground">
              {selectedListing.title} — steps are created when a listing enters review (e.g. PENDING_REVIEW).
            </p>
          )}
          {selectedListingId && stepsError && (
            <div className="mt-3 text-sm text-destructive">
              {stepsErr instanceof ApiError ? stepsErr.message : "Failed to load steps."}
              <Button variant="outline" size="sm" className="ml-2 h-7" onClick={() => void refetchSteps()}>
                Retry
              </Button>
            </div>
          )}
          {selectedListingId && stepsLoading && <p className="mt-3 text-sm text-muted-foreground">Loading steps…</p>}
          {selectedListingId && !stepsLoading && !stepsError && steps && steps.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              No verification steps for this listing yet. Move the listing to PENDING_REVIEW to generate steps.
            </p>
          )}
          {steps && steps.length > 0 && (
            <ul className="mt-3 space-y-3">
              {steps.map((s) => (
                <li key={s.id} className="rounded border border-border/80 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.label}</span>
                    <Badge variant="outline">{s.status}</Badge>
                    {s.assignedProfessionalId && (
                      <span className="text-xs text-muted-foreground">Assigned pro id: {s.assignedProfessionalId}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="min-w-[200px] flex-1">
                      <p className="mb-1 text-xs text-muted-foreground">Assign professional</p>
                      <Select
                        disabled={prosLoading || professionals.length === 0}
                        value={professionalByStep[s.type] ?? ""}
                        onValueChange={(v) => setProfessionalByStep((prev) => ({ ...prev, [s.type]: v }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={prosLoading ? "Loading…" : "Select"} />
                        </SelectTrigger>
                        <SelectContent>
                          {professionals.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} ({p.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="h-9"
                      disabled={assignMutation.isPending || prosLoading}
                      onClick={() => assignStep(s.type)}
                    >
                      Assign
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
