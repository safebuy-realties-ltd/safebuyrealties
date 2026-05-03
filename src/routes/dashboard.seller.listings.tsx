import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout, PageHeader } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useListingsQuery } from "@/hooks/use-listings";
import { apiRequest } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/dashboard/seller/listings")({
  component: () => (
    <DashboardLayout role="seller">
      <SellerListingsPage />
    </DashboardLayout>
  ),
});

type CreateListingInput = {
  title: string;
  description: string;
  location: string;
  price: number;
  currency: string;
};

function SellerListingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useListingsQuery({ ownedOnly: true });

  const createListing = useMutation({
    mutationFn: (payload: CreateListingInput) =>
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
      <PageHeader
        title="Your listings"
        description="Create and manage your property listings."
      />

      <CreateListingForm
        isSubmitting={createListing.isPending}
        error={createListing.error instanceof Error ? createListing.error.message : null}
        onSubmit={(values) => createListing.mutate(values)}
      />

      <div className="mt-6 rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Owned listings</h2>
        <p className="mb-4 text-sm text-muted-foreground">Showing listings owned by {user?.name ?? "you"}.</p>

        {isLoading && <p className="text-sm text-muted-foreground">Loading listings…</p>}

        {!isLoading && listings.length === 0 && <p className="text-sm text-muted-foreground">No listings yet.</p>}

        <div className="space-y-3">
          {listings.map((listing) => (
            <div key={listing.id} className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3">
              <div>
                <p className="font-medium">{listing.title}</p>
                <p className="text-sm text-muted-foreground">{listing.location}</p>
              </div>
              <Badge variant="outline">{listing.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CreateListingForm({
  isSubmitting,
  error,
  onSubmit,
}: {
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: CreateListingInput) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    price: "",
    currency: "NGN",
  });

  return (
    <form
      className="rounded-xl border border-border/60 bg-card p-5 shadow-[var(--shadow-card)]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          title: form.title.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          price: Number(form.price),
          currency: form.currency.trim() || "NGN",
        });
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
