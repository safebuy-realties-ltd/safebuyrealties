import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { ListingDto } from "@/hooks/use-listings";

export function useUpdateListingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      apiRequest<ListingDto>(`/listings/${args.id}`, {
        method: "PATCH",
        body: JSON.stringify(args.body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["listings"] });
      void qc.invalidateQueries({ queryKey: ["listing"] });
      void qc.invalidateQueries({ queryKey: ["staff", "queue"] });
    },
  });
}
