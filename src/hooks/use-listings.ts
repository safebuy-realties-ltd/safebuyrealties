import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type ListingDto = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  location: string;
  price: string;
  currency: string;
  status: string;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export function useListingsQuery() {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["listings", user?.id ?? "anon"],
    queryFn: () => apiRequest<ListingDto[]>("/listings"),
    enabled: isReady && !!user,
    select: (envelope) => ({
      listings: envelope.data,
      meta: envelope.meta as { page: number; pageSize: number; total: number } | undefined,
    }),
  });
}

export function useListingQuery(listingId: string) {
  return useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => apiRequest<ListingDto>(`/listings/${listingId}`),
    select: (envelope) => envelope.data,
    enabled: !!listingId,
  });
}
