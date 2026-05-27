import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useListingsQuery } from "@/hooks/use-listings";
import { apiRequest } from "@/lib/api";
import { statusBadgeClass, statusLabel } from "@/lib/listing-status";
import {
  buildCreateListingPayload,
  type CreateListingFormValues,
  type CreateListingPayload,
} from "@/lib/listing-spec";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useListingAnalyticsQuery } from "@/hooks/use-listing-analytics";

export const Route = createFileRoute("/dashboard/seller/listings")({
  component: SellerListingsPage,
});

function SellerListingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useListingsQuery({ ownedOnly: true });

  const createListing = useMutation({
    mutationFn: (payload: CreateListingPayload) =>
      apiRequest("/listings", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
      await navigate({ to: "/dashboard/seller/listings" });
    },
  });

  const listings = useMemo(() => data?.listings ?? [], [data?.listings]);

  return (
    <>
      <PageHeader title="Your listings" description="Create and manage your property listings." />

      <CreateListingForm
        isSubmitting={createListing.isPending}
        error={createListing.error instanceof Error ? createListing.error.message : null}
        onSubmit={(values) => createListing.mutate(values)}
      />

      <div className="mt-6 rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Owned listings</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Showing listings owned by {user?.name ?? "you"}.
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Loading listings…</p>}

        {!isLoading && listings.length === 0 && (
          <p className="text-sm text-muted-foreground">No listings yet.</p>
        )}

        <div className="space-y-3">
          {listings.map((listing) => (
            <SellerListingRow key={listing.id} listing={listing} />
          ))}
        </div>
      </div>
    </>
  );
}

function SellerListingRow({
  listing,
}: {
  listing: {
    id: string;
    title: string;
    location: string;
    status: string;
  };
}) {
  const { data: analytics, isLoading } = useListingAnalyticsQuery(listing.id);

  return (
    <div className="rounded-md border border-border/60 px-4 py-3">
      <Link
        to="/listings/$listingId"
        params={{ listingId: listing.id }}
        className="flex items-center justify-between transition-colors hover:opacity-90"
      >
        <div>
          <p className="font-medium">{listing.title}</p>
          <p className="text-sm text-muted-foreground">{listing.location}</p>
        </div>
        <Badge variant="outline" className={statusBadgeClass(listing.status)}>
          {statusLabel(listing.status)}
        </Badge>
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/40 pt-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">Views</p>
          <p className="font-medium">{isLoading ? "…" : (analytics?.views ?? 0)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Saves</p>
          <p className="font-medium">{isLoading ? "…" : (analytics?.saves ?? 0)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Transactions</p>
          <p className="font-medium">{isLoading ? "…" : (analytics?.transactionCount ?? 0)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">DD purchases</p>
          <p className="font-medium">{isLoading ? "…" : (analytics?.ddPurchases ?? 0)}</p>
        </div>
      </div>
    </div>
  );
}

function CreateListingForm({
  isSubmitting,
  error,
  onSubmit,
}: {
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: CreateListingPayload) => void;
}) {
  const [form, setForm] = useState<CreateListingFormValues>({
    title: "",
    description: "",
    location: "",
    price: "",
    currency: "NGN",
    beds: "",
    baths: "",
    landAreaSqm: "",
    buildType: "",
  });

  return (
    <form
      className="rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(buildCreateListingPayload(form));
      }}
    >
      <h2 className="text-lg font-semibold">Create listing</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Input
          placeholder="Listing title"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          required
        />
        <Input
          placeholder="Location"
          value={form.location}
          onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
          required
        />
        <Input
          type="number"
          min="0"
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
          required
        />
        <Input
          placeholder="Currency (e.g. NGN)"
          value={form.currency}
          onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
        />
        <Input
          type="number"
          min="0"
          placeholder="Beds (optional)"
          value={form.beds}
          onChange={(e) => setForm((p) => ({ ...p, beds: e.target.value }))}
        />
        <Input
          type="number"
          min="0"
          placeholder="Baths (optional)"
          value={form.baths}
          onChange={(e) => setForm((p) => ({ ...p, baths: e.target.value }))}
        />
        <Input
          type="number"
          min="0"
          placeholder="Land area m² (optional)"
          value={form.landAreaSqm}
          onChange={(e) => setForm((p) => ({ ...p, landAreaSqm: e.target.value }))}
        />
        <Input
          placeholder="Build type (e.g. Detached)"
          value={form.buildType}
          onChange={(e) => setForm((p) => ({ ...p, buildType: e.target.value }))}
        />
      </div>
      <Textarea
        className="mt-3"
        placeholder="Describe the property"
        value={form.description}
        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        required
      />
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <Button disabled={isSubmitting} className="mt-4" type="submit">
        {isSubmitting ? "Creating…" : "Create listing"}
      </Button>
    </form>
  );
}
