import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ListingDto } from "@/hooks/use-listings";

const SAVED_KEY = ["listings", "saved"] as const;

export function useSavedListingsQuery(page = 1, pageSize = 20) {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: [...SAVED_KEY, page, pageSize],
    queryFn: () =>
      apiRequest<{
        listings: ListingDto[];
        savedIds: string[];
        meta: { page: number; pageSize: number; total: number };
      }>(`/listings/saved?page=${page}&pageSize=${pageSize}`).then((e) => e.data),
    enabled: isReady && user?.role === "buyer",
  });
}

export function useSaveListingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) =>
      apiRequest<{ saved: boolean; listingId: string }>(`/listings/${listingId}/save`, {
        method: "POST",
      }).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SAVED_KEY });
      void qc.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}

export function useUnsaveListingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) =>
      apiRequest<{ saved: boolean; listingId: string }>(`/listings/${listingId}/save`, {
        method: "DELETE",
      }).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SAVED_KEY });
      void qc.invalidateQueries({ queryKey: ["listings"] });
    },
  });
}
