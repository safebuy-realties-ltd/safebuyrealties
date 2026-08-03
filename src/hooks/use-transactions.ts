import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ListingDto } from "@/hooks/use-listings";

/** Why the server will not let this buyer purchase, matching `PURCHASE_BLOCK` on the backend. */
export type PurchaseBlockCode =
  | "FEATURE_OFF"
  | "DUE_DILIGENCE_UNFINISHED"
  | "VERDICT_AGAINST"
  | "KYC_REQUIRED"
  | "ALREADY_IN_ESCROW"
  | "TRANSACTION_CLOSED";

/**
 * The server's answer on whether the purchase step is open, sent with every transaction.
 *
 * The browser does not work this out. E1-S4 moved the rule to one function that both the serializer
 * and the payments service read, because a button drawn from one copy of the rule in front of an
 * endpoint enforcing another copy is how a blocked purchase gets taken anyway.
 */
export type TransactionPurchaseDto = {
  canPurchase: boolean;
  blockedBy: PurchaseBlockCode | null;
  /** Why not, in the buyer's words. Null when they can purchase. */
  reason: string | null;
  /** A warning that does not block, shown alongside a purchase that is allowed but qualified. */
  caution: string | null;
};

/**
 * The newest payment against the transaction, or null when there has never been one.
 *
 * This replaced the payment id the browser used to keep in `localStorage`. The association between a
 * transaction and the payment against it is a fact about the transaction, and a cleared browser is
 * not a reason to lose it.
 */
export type TransactionPaymentDto = {
  id: string;
  status: string;
  intent: string;
  amount: string;
  reference: string | null;
  createdAt: string;
};

export type TransactionDto = {
  id: string;
  // status values: INITIATED | IN_PROGRESS | COMPLETED | DD_PURCHASED | DD_IN_PROGRESS
  //              | DD_COMPLETE | PURCHASE_PENDING | PURCHASE_IN_ESCROW
  status: string;
  buyerId: string;
  listingId: string;
  createdAt: string;
  updatedAt: string;
  listing: Pick<ListingDto, "id" | "title" | "location" | "price" | "currency" | "status">;
  purchase: TransactionPurchaseDto;
  latestPayment: TransactionPaymentDto | null;
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
