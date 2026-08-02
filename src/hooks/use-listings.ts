import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, type ApiEnvelope } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type ListingMediaDto = {
  id: string;
  listingId: string;
  storageKey: string;
  type: "hero" | "gallery";
  sortOrder: number;
  createdAt: string;
};

export type PublicListingDocumentDto = {
  name: string;
};

export type ListingDto = {
  id: string;
  sellerId: string;
  sellerName?: string;
  propertyId?: string | null;
  title: string;
  description: string;
  location: string;
  price: string;
  currency: string;
  status: string;
  isPublished?: boolean;
  propertyType?: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  beds?: number | null;
  baths?: number | null;
  landAreaSqm?: number | null;
  buildType?: string | null;
  media?: ListingMediaDto[];
};

export type ListingsQueryOptions = {
  status?: string;
  sellerId?: string;
  ownedOnly?: boolean;
  page?: number;
  pageSize?: number;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  buildType?: string;
  minBeds?: number;
};

function listingsQueryString(options?: ListingsQueryOptions) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("pageSize", String(pageSize));
  if (options?.status) qs.set("status", options.status);
  if (options?.sellerId) qs.set("sellerId", options.sellerId);
  if (options?.location) qs.set("location", options.location);
  if (options?.minPrice != null) qs.set("minPrice", String(options.minPrice));
  if (options?.maxPrice != null) qs.set("maxPrice", String(options.maxPrice));
  if (options?.buildType) qs.set("buildType", options.buildType);
  if (options?.minBeds != null) qs.set("minBeds", String(options.minBeds));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/**
 * `initialData` is what the server render already fetched (E8-S4 criterion 1). Passing it means the
 * first paint in the browser shows the same rows the HTML did instead of a spinner, and react-query
 * still refetches on mount, so nothing here decides how long the data stays fresh.
 */
export function usePublicListingsQuery(
  options?: ListingsQueryOptions,
  initialData?: ApiEnvelope<ListingDto[]>,
) {
  const { isReady } = useAuth();
  const q = listingsQueryString(options);
  return useQuery({
    queryKey: [
      "listings",
      "public",
      options?.status ?? null,
      options?.page ?? 1,
      options?.pageSize ?? 20,
      options?.location ?? null,
      options?.minPrice ?? null,
      options?.maxPrice ?? null,
      options?.buildType ?? null,
      options?.minBeds ?? null,
    ],
    queryFn: () => apiRequest<ListingDto[]>(`/listings${q}`),
    enabled: isReady,
    initialData,
    select: (envelope) => ({
      listings: envelope.data,
      meta: envelope.meta as { page: number; pageSize: number; total: number } | undefined,
    }),
  });
}

export function useListingsQuery(options?: ListingsQueryOptions) {
  const { user, isReady } = useAuth();
  const sellerId = options?.ownedOnly ? user?.id : options?.sellerId;
  const q = listingsQueryString({ ...options, sellerId });
  return useQuery({
    queryKey: [
      "listings",
      user?.id ?? "anon",
      options?.status ?? null,
      sellerId ?? null,
      options?.page ?? 1,
      options?.pageSize ?? 20,
      options?.location ?? null,
      options?.minPrice ?? null,
      options?.maxPrice ?? null,
      options?.buildType ?? null,
      options?.minBeds ?? null,
    ],
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
    initialData: initialData
      ? ({ data: initialData } satisfies ApiEnvelope<ListingDto>)
      : undefined,
  });
}

export function usePublicListingDocumentsQuery(listingId: string | null) {
  return useQuery({
    queryKey: ["listing", listingId, "public-documents"],
    queryFn: () =>
      apiRequest<PublicListingDocumentDto[]>(`/listings/${listingId}/public-documents`),
    select: (envelope) => envelope.data,
    enabled: !!listingId,
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
      beds?: number;
      baths?: number;
      landAreaSqm?: number;
      buildType?: string;
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
