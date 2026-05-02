import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ListingDto } from "@/hooks/use-listings";

export type TransactionDto = {
  id: string;
  status: string;
  buyerId: string;
  listingId: string;
  createdAt: string;
  updatedAt: string;
  listing: Pick<ListingDto, "id" | "title" | "location" | "price" | "currency" | "status">;
};

export function useMyTransactionsQuery() {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["transactions", "me", user?.id ?? "anon"],
    queryFn: () => apiRequest<TransactionDto[]>("/transactions/me"),
    enabled: isReady && !!user && user.role === "buyer",
    select: (envelope) => envelope.data,
  });
}

export function useTransactionQuery(id: string | null) {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["transactions", id],
    queryFn: () => apiRequest<TransactionDto>(`/transactions/${id}`),
    select: (envelope) => envelope.data,
    enabled: isReady && !!user && !!id,
  });
}

export function useCreateTransactionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) =>
      apiRequest<TransactionDto>("/transactions", {
        method: "POST",
        body: JSON.stringify({ listingId }),
      }).then((envelope) => envelope.data),
    onSuccess: (_data, listingId) => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["listings"] });
      void qc.invalidateQueries({ queryKey: ["listing", listingId] });
    },
  });
}
