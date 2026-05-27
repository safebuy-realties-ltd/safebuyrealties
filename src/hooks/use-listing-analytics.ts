import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type ListingAnalyticsDto = {
  views: number;
  saves: number;
  transactionCount: number;
  ddPurchases: number;
};

export function useListingAnalyticsQuery(listingId: string | null) {
  return useQuery({
    queryKey: ["listings", listingId, "analytics"],
    queryFn: () =>
      apiRequest<ListingAnalyticsDto>(`/listings/${listingId}/analytics`).then((e) => e.data),
    enabled: !!listingId,
  });
}
