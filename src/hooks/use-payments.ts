import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type InitiatePaymentResult = {
  paymentId: string;
  authorizationUrl: string;
  reference: string;
  accessCode: string | null;
};

export type PaymentDto = {
  id: string;
  listingId: string | null;
  transactionId: string | null;
  payerId: string;
  amount: string;
  currency: string;
  provider: string;
  providerReference: string | null;
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  intent: "DD_SERVICE" | "PROPERTY_PURCHASE";
  metadata: unknown;
  /** True when the payment was settled by mock mode rather than by Paystack. */
  isMock: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PaymentConfigDto = {
  enabled: boolean;
  publicKey: string | null;
  mockMode: boolean;
};

/** Reports whether the API is running against live Paystack or in mock mode. */
export function usePaymentConfigQuery() {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["payments", "config"],
    queryFn: () => apiRequest<PaymentConfigDto>("/payments/config"),
    select: (envelope) => envelope.data,
    enabled: isReady && !!user,
    staleTime: 5 * 60_000,
  });
}

export function usePaymentQuery(id: string | null) {
  const { user, isReady } = useAuth();
  return useQuery({
    queryKey: ["payments", id],
    queryFn: () => apiRequest<PaymentDto>(`/payments/${id}`),
    select: (envelope) => envelope.data,
    enabled: isReady && !!user && !!id,
    refetchInterval: 5_000,
  });
}

export function useVerifyPaymentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      apiRequest<PaymentDto>(`/payments/${paymentId}/verify`, { method: "POST" }).then(
        (e) => e.data,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["listings"] });
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["escrow"] });
    },
  });
}

export function useInitiatePaymentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      amount: number;
      currency?: string;
      listingId?: string;
      transactionId?: string;
      callbackUrl: string;
      intent?: "DD_SERVICE" | "PROPERTY_PURCHASE";
      ddOrderId?: string;
    }) =>
      apiRequest<InitiatePaymentResult>("/payments/initiate", {
        method: "POST",
        body: JSON.stringify(body),
      }).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["listings"] });
      void qc.invalidateQueries({ queryKey: ["escrow"] });
    },
  });
}
