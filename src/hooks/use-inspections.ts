import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type InspectionSlotDto = {
  id: string;
  listingId: string;
  professionalId: string | null;
  requestedById: string;
  scheduledAt: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  listingTitle?: string;
  listingLocation?: string;
};

export function useListingInspectionsQuery(listingId: string | null) {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["inspections", "listing", listingId],
    queryFn: () =>
      apiRequest<InspectionSlotDto[]>(`/listings/${listingId}/inspection-requests`).then(
        (e) => e.data,
      ),
    enabled: isReady && !!user && !!listingId,
  });
}

export function useMyInspectionsQuery() {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["inspections", "me"],
    queryFn: () => apiRequest<InspectionSlotDto[]>("/inspections/me").then((e) => e.data),
    enabled: isReady && user?.role === "buyer",
  });
}

export function useCreateInspectionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { listingId: string; scheduledAt: string; notes?: string }) =>
      apiRequest<InspectionSlotDto>(
        `/listings/${body.listingId}/inspection-requests`,
        {
          method: "POST",
          body: JSON.stringify({
            scheduledAt: body.scheduledAt,
            notes: body.notes,
          }),
        },
      ).then((e) => e.data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["inspections", "listing", vars.listingId] });
      void qc.invalidateQueries({ queryKey: ["inspections", "me"] });
    },
  });
}
