import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type EscrowDto = {
  id: string;
  transactionId: string;
  status: string;
  heldAmount: string;
  releaseConditions: unknown;
  conditionsMet: unknown;
  heldAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  releasedById: string | null;
  releaseNote: string | null;
  unmetConditions: { code: string; label: string }[];
  transaction: {
    id: string;
    status: string;
    buyerId: string;
    listingId: string;
    listing: { id: string; title: string; sellerId: string; status: string };
    buyer: { id: string; name: string; email: string };
  };
  createdAt: string;
  updatedAt: string;
};

export type PayoutDto = {
  id: string;
  transactionId: string;
  sellerId: string;
  grossAmount: string;
  platformFee: string;
  netAmount: string;
  status: string;
  gatewayReference: string | null;
  initiatedAt: string | null;
  completedAt: string | null;
};

export function escrowStatusLabel(status: string) {
  const m: Record<string, string> = {
    AWAITING_FUNDS: "Awaiting Funds",
    HELD: "Held",
    RELEASED: "Released",
    REFUNDED: "Refunded",
  };
  return m[status] ?? status;
}

export function useEscrowQuery(transactionId: string | null, enabled = true) {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["escrow", transactionId],
    queryFn: () => apiRequest<EscrowDto>(`/escrow/${transactionId}`),
    select: (envelope) => envelope.data,
    enabled: isReady && !!user && !!transactionId && enabled,
    retry: false,
  });
}

export function useHeldEscrowsQuery() {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["escrow", "held"],
    queryFn: () => apiRequest<EscrowDto[]>("/escrow/held"),
    select: (envelope) => envelope.data,
    enabled: isReady && !!user && (user.role === "staff" || user.role === "admin"),
  });
}

export function useReleaseEscrowMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ transactionId, note }: { transactionId: string; note?: string }) =>
      apiRequest<{ escrow: EscrowDto; payout: PayoutDto }>(`/escrow/${transactionId}/release`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }).then((envelope) => envelope.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["escrow"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useRefundEscrowMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ transactionId, note }: { transactionId: string; note?: string }) =>
      apiRequest<EscrowDto>(`/escrow/${transactionId}/refund`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }).then((envelope) => envelope.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["escrow"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
