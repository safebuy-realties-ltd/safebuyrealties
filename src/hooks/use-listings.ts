import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type ListingDto = {
  id: string;
  sellerId: string;
  sellerName?: string;
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
  beds?: number | null;
  baths?: number | null;
  landAreaSqm?: number | null;
  buildType?: string | null;
};

export type ListingsQueryOptions = {
  status?: string;
  sellerId?: string;
  ownedOnly?: boolean;
  page?: number;
  pageSize?: number;
};

function listingsQueryString(options?: ListingsQueryOptions) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (options?.status) qs.set("status", options.status);
  if (options?.sellerId) qs.set("sellerId", options.sellerId);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useListingsQuery(options?: ListingsQueryOptions) {
  const { user, isReady } = useAuth();
  const sellerId = options?.ownedOnly ? user?.id : options?.sellerId;
  const q = listingsQueryString({ ...options, sellerId });
  return useQuery({
    queryKey: ["listings", user?.id ?? "anon", options?.status ?? null, sellerId ?? null, options?.page ?? 1, options?.pageSize ?? 20],
    queryFn: () => apiRequest<ListingDto[]>(`/listings${q}`),
    enabled: isReady && !!user,
    select: (envelope) => ({
      listings: envelope.data,
      meta: envelope.meta as { page: number; pageSize: number; total: number } | undefined,
    }),
  });
}

export function useListingQuery(listingId: string, initialData?: ListingDto) {
  return useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => apiRequest<ListingDto>(`/listings/${listingId}`),
    select: (envelope) => envelope.data as ListingDto,
    enabled: !!listingId,
    initialData: initialData ? ({ data: initialData } as any) : undefined,
  });
}

export function useCreateListingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description: string;
      location: string;
      price: number;
      currency?: string;
    }) =>
      apiRequest<ListingDto>("/listings", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}
